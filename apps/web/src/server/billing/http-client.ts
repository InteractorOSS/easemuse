// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { AGENCY_SUBSCRIBER_TYPE } from './metrics';
import {
  BillingError,
  type BillingClient,
  type BillingInvoice,
  type BillingLimit,
  type BillingPlan,
  type BillingSubscriptionState,
} from './types';

/**
 * The live Billing Server client. The endpoints and payloads follow what product-manager already uses
 * against the same server (`GET /api/public/plans`, `GET /api/service/subscriptions/check`,
 * `GET /api/service/limits`, `POST /api/service/subscriptions`, `POST /api/service/usage`,
 * `GET /api/service/charges`), authenticated with an Account Server service token.
 *
 * NOT YET EXERCISED AGAINST THE LIVE SERVER: no credentials existed when this was written. The tests
 * use a fake `fetch` that returns the shapes product-manager parses. Fields the server may omit are
 * read leniently; a response that cannot be understood counts as "could not read", never as "none".
 */
export interface HttpBillingOptions {
  baseUrl: () => string;
  getToken: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

type Json = Record<string, unknown>;
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export function createHttpBillingClient(options: HttpBillingOptions): BillingClient {
  const fetchImpl = options.fetch ?? fetch;
  const subscriber = (agencyId: string) =>
    `subscriber_id=${encodeURIComponent(agencyId)}&subscriber_type=${AGENCY_SUBSCRIBER_TYPE}`;

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      return await fetchImpl(`${options.baseUrl()}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await options.getToken()}`,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      throw new BillingError(
        error instanceof Error && error.name === 'AbortError' ? 'timed out' : 'no answer',
        0,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** The server's own refusal code (for example `no_active_subscriptions`), bounded; never the whole body. */
  async function failure(res: Response, what: string): Promise<BillingError> {
    const text = await res.text().catch(() => '');
    let code = '';
    try {
      const parsed = JSON.parse(text) as { error?: { code?: unknown } };
      if (typeof parsed.error?.code === 'string') code = ` ${parsed.error.code}`;
    } catch {
      /* not JSON: keep only the status */
    }
    return new BillingError(`${what} failed: HTTP ${res.status}${code}`, res.status);
  }

  const data = async (res: Response): Promise<unknown> =>
    ((await res.json().catch(() => null)) as { data?: unknown } | null)?.data;

  return {
    name: 'live',

    async listPlans() {
      const res = await call('/api/public/plans');
      if (!res.ok) throw await failure(res, 'List plans');
      const rows = await data(res);
      if (!Array.isArray(rows)) throw new BillingError('List plans: unexpected answer', res.status);
      return rows.map((row: Json): BillingPlan => ({
        id: String(row.id),
        role: asString(row.role),
        name: asString(row.name) ?? String(row.id),
        basePrice: asString(row.base_price),
        currency: asString(row.currency),
        billingPeriod: asString(row.billing_period),
        metrics: (Array.isArray(row.metrics) ? (row.metrics as Json[]) : []).map((m) => ({
          name: String(m.name),
          displayName: asString(m.display_name) ?? String(m.name),
          limit: asNumber(m.limit),
          limitType: m.limit_type === 'hard' || m.limit_type === 'soft' ? m.limit_type : null,
        })),
      }));
    },

    async getState(agencyId): Promise<BillingSubscriptionState | null> {
      try {
        const [checkRes, limitsRes] = await Promise.all([
          call(`/api/service/subscriptions/check?${subscriber(agencyId)}`),
          call(`/api/service/limits?${subscriber(agencyId)}`),
        ]);
        if (!checkRes.ok) return null;
        const check = (await data(checkRes)) as {
          subscriptions?: Json[];
          has_active_subscription?: boolean;
        } | null;
        const subscriptions = Array.isArray(check?.subscriptions) ? check.subscriptions : [];
        // The server says there is one but sent none: that is a payload we cannot act on, not "no plan".
        if (check?.has_active_subscription === true && subscriptions.length === 0) return null;
        const first = subscriptions[0];
        let limits: BillingLimit[] = [];
        if (limitsRes.ok) {
          const body = (await data(limitsRes)) as { limits?: Record<string, Json> } | null;
          limits = Object.entries(body?.limits ?? {}).map(([metric, entry]) => ({
            metric,
            limit: asNumber(entry.limit),
            used: asNumber(entry.used) ?? 0,
            type:
              entry.type === 'hard' || entry.type === 'soft' || entry.type === 'unlimited'
                ? entry.type
                : 'unlimited',
          }));
        }
        return {
          subscription: first
            ? {
                id: String(first.id),
                planId: String(first.plan_id),
                status: asString(first.status) ?? 'unknown',
              }
            : null,
          limits,
        };
      } catch {
        return null;
      }
    },

    async createSubscription(agencyId, planId) {
      const res = await call('/api/service/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          subscriber_id: agencyId,
          subscriber_type: AGENCY_SUBSCRIBER_TYPE,
          plan_id: planId,
        }),
      });
      if (res.status === 409) return { status: 'already_exists' as const };
      if (!res.ok) throw await failure(res, 'Create subscription');
      const created = (await data(res)) as { id?: unknown } | null;
      if (typeof created?.id !== 'string') {
        throw new BillingError(
          'Create subscription answered without a subscription id',
          res.status,
        );
      }
      return { status: 'created' as const, subscriptionId: created.id };
    },

    async reportUsage(report) {
      const res = await call('/api/service/usage', {
        method: 'POST',
        body: JSON.stringify({
          subscriber_id: report.agencyId,
          subscriber_type: AGENCY_SUBSCRIBER_TYPE,
          metric_name: report.metric,
          count: report.quantity,
          idempotency_key: report.idempotencyKey,
        }),
      });
      if (!res.ok) throw await failure(res, 'Report usage');
    },

    async listInvoices(agencyId): Promise<BillingInvoice[] | null> {
      try {
        const res = await call(`/api/service/charges?${subscriber(agencyId)}&limit=24`);
        if (!res.ok) return null;
        const rows = await data(res);
        if (!Array.isArray(rows)) return null;
        return rows.map((row: Json) => {
          const period = (row.period ?? {}) as Json;
          return {
            id: String(row.id),
            kind: asString(row.kind) ?? 'subscription',
            amount: asString(row.amount) ?? '0',
            currency: asString(row.currency) ?? 'USD',
            status: asString(row.status) ?? 'open',
            periodStart: asString(period.start) ?? '',
            periodEnd: asString(period.end) ?? '',
            issuedAt: asString(row.issued_at) ?? '',
            paidAt: asString(row.paid_at),
          };
        });
      } catch {
        return null;
      }
    },
  };
}
