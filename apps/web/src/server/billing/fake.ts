// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { BILLING_METRICS } from './metrics';
import {
  BillingError,
  type BillingClient,
  type BillingInvoice,
  type BillingPlan,
  type BillingSubscriptionState,
  type UsageReport,
} from './types';

/** Two sample plans for development and tests; the real catalogue lives in Billing Server. */
export const SAMPLE_PLANS: BillingPlan[] = [
  {
    id: 'plan-starter',
    role: 'easemuse_starter',
    name: 'Starter',
    basePrice: '99.00',
    currency: 'USD',
    billingPeriod: 'monthly',
    metrics: [
      { name: BILLING_METRICS.seats, displayName: 'Seats', limit: 3, limitType: 'hard' },
      {
        name: BILLING_METRICS.aiCostCents,
        displayName: 'AI cost (cents)',
        limit: null,
        limitType: 'soft',
      },
    ],
  },
  {
    id: 'plan-team',
    role: 'easemuse_team',
    name: 'Team',
    basePrice: '399.00',
    currency: 'USD',
    billingPeriod: 'monthly',
    metrics: [
      { name: BILLING_METRICS.seats, displayName: 'Seats', limit: 10, limitType: 'hard' },
      {
        name: BILLING_METRICS.aiCostCents,
        displayName: 'AI cost (cents)',
        limit: null,
        limitType: 'soft',
      },
    ],
  },
];

export interface RecordingBillingFake extends BillingClient {
  readonly name: 'fake';
  /** Every call, in order, for assertions. */
  readonly calls: { method: string; args: unknown[] }[];
  /** Usage reports that were accepted (a repeated idempotency key is accepted once). */
  readonly reports: UsageReport[];
  /** Make the next calls fail like the server being down, until reset. */
  failWith(error: BillingError | null): void;
  setInvoices(agencyId: string, invoices: BillingInvoice[]): void;
  /** Starts an agency on a plan without going through `createSubscription` (a subscription made elsewhere). */
  subscribe(agencyId: string, planId: string, status?: string): void;
}

/**
 * An in-memory Billing Server that records what it is asked, for tests and for running the app
 * before credentials exist (`BILLING_MODE=fake`). It behaves like the server where it matters here:
 * one subscription per agency, limits come from the plan, usage is deduplicated by idempotency key.
 */
export function createRecordingBillingFake(
  plans: BillingPlan[] = SAMPLE_PLANS,
): RecordingBillingFake {
  const calls: RecordingBillingFake['calls'] = [];
  const reports: UsageReport[] = [];
  const keys = new Set<string>();
  const subscriptions = new Map<string, { id: string; planId: string; status: string }>();
  const invoices = new Map<string, BillingInvoice[]>();
  const used = new Map<string, number>();
  let failure: BillingError | null = null;
  let counter = 0;

  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args });
    if (failure) throw failure;
  };

  return {
    name: 'fake',
    calls,
    reports,
    failWith: (error) => {
      failure = error;
    },
    setInvoices: (agencyId, list) => {
      invoices.set(agencyId, list);
    },
    subscribe(agencyId, planId, status = 'active') {
      subscriptions.set(agencyId, { id: `sub-${++counter}`, planId, status });
    },
    async listPlans() {
      record('listPlans', []);
      return plans;
    },
    async getState(agencyId): Promise<BillingSubscriptionState | null> {
      try {
        record('getState', [agencyId]);
      } catch {
        return null;
      }
      const sub = subscriptions.get(agencyId);
      if (!sub) return { subscription: null, limits: [] };
      const plan = plans.find((p) => p.id === sub.planId);
      return {
        subscription: sub,
        limits: (plan?.metrics ?? []).map((m) => ({
          metric: m.name,
          limit: m.limit,
          used: used.get(`${agencyId}:${m.name}`) ?? 0,
          type: m.limitType ?? 'unlimited',
        })),
      };
    },
    async createSubscription(agencyId, planId) {
      record('createSubscription', [agencyId, planId]);
      if (!plans.some((p) => p.id === planId)) throw new BillingError('Unknown plan', 404);
      const existing = subscriptions.get(agencyId);
      if (existing) {
        if (existing.planId === planId) return { status: 'already_exists' as const };
        throw new BillingError('subscription_exists', 409);
      }
      const subscriptionId = `sub-${++counter}`;
      subscriptions.set(agencyId, { id: subscriptionId, planId, status: 'active' });
      return { status: 'created' as const, subscriptionId };
    },
    async reportUsage(report) {
      record('reportUsage', [report]);
      if (!subscriptions.has(report.agencyId))
        throw new BillingError('no_active_subscriptions', 404);
      if (keys.has(report.idempotencyKey)) return;
      keys.add(report.idempotencyKey);
      reports.push(report);
      const k = `${report.agencyId}:${report.metric}`;
      used.set(k, (used.get(k) ?? 0) + report.quantity);
    },
    async listInvoices(agencyId) {
      try {
        record('listInvoices', [agencyId]);
      } catch {
        return null;
      }
      return invoices.get(agencyId) ?? [];
    },
  };
}
