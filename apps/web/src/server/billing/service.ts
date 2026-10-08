// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import type { PlatformAdminActor } from '@easemuse/core';
import { getAgencyByRef, listActiveAgencyIds, withAgency, type ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { getBudgetStatus } from '@/server/ai/ledger';
import { recordPlatformAudit } from '@/server/platform/audit';
import type { JobContext } from '@/worker/registry';
import { billingMode, getBillingClient, type BillingMode } from './index';
import { BILLING_METRICS } from './metrics';
import { parseBillingState, type BillingState } from './state';
import { BillingError, type BillingClient, type BillingInvoice, type BillingPlan } from './types';

/**
 * Plans, seats and usage through the Interactor Billing Server (T-13-08, FR-TEN-05, ADR-013). EaseMuse
 * reports usage after the fact and reads plan state back; the plan's seat limit is enforced here from
 * the last synced state, and AI spend stays gated by the agency's own monthly budget.
 */

const MAX_ATTEMPTS = 10;

export interface BillingOverview {
  connected: boolean;
  mode: BillingMode;
  plan: {
    id: string | null;
    name: string | null;
    status: string | null;
    syncedAt: string | null;
    /** Set when the last sync could not read Billing Server: the plan shown is the last one known. */
    error: string | null;
  } | null;
  seats: { active: number; pending: number; limit: number | null };
  usage: {
    month: string;
    aiCostUsd: number;
    /** Whole cents of AI cost already reported to Billing Server this month. */
    reportedCents: number;
    failedReports: number;
    lastReportedAt: Date | null;
  };
  /** Newest first; null when not connected or the server could not be read. */
  invoices: BillingInvoice[] | null;
}

const monthKey = (now: Date) => now.toISOString().slice(0, 7);
const dayKey = (now: Date) => now.toISOString().slice(0, 10);
const errorCode = (error: unknown) =>
  error instanceof BillingError ? (error.status ? `http_${error.status}` : 'no_answer') : 'error';

async function seatCounts(tx: ScopedTx, agencyId: string, now: Date) {
  const [active, pending] = await Promise.all([
    tx.membership.count({ where: { agencyId, active: true } }),
    tx.memberInvite.count({
      where: { agencyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    }),
  ]);
  return { active, pending };
}

/** What the agency admin and the platform administrator see: plan, seats, this month's usage and invoices. */
export async function getBillingOverview(
  agencyId: string,
  now: Date = new Date(),
): Promise<BillingOverview> {
  const client = getBillingClient();
  const month = monthKey(now);
  const local = await withAgency(agencyId, async (tx) => {
    const row = await tx.agency.findUnique({ where: { id: agencyId }, select: { billing: true } });
    const reports = await tx.billingUsageReport.findMany({
      where: { metric: BILLING_METRICS.aiCostCents, periodKey: month },
    });
    return {
      state: parseBillingState(row?.billing),
      seats: await seatCounts(tx, agencyId, now),
      budget: await getBudgetStatus(tx, agencyId, now),
      reports,
    };
  });
  const sent = local.reports.filter((r) => r.status === 'sent');
  const { state } = local;
  return {
    connected: client !== null,
    mode: billingMode(),
    plan: state.planId
      ? {
          id: state.planId,
          name: state.planName ?? state.planRole ?? null,
          status: state.status ?? null,
          syncedAt: state.syncedAt ?? null,
          error: state.error,
        }
      : null,
    seats: { ...local.seats, limit: state.seatLimit },
    usage: {
      month,
      aiCostUsd: local.budget.spentUsd,
      reportedCents: sent.reduce((sum, r) => sum + r.quantity, 0),
      failedReports: local.reports.filter((r) => r.status === 'failed').length,
      lastReportedAt: sent.reduce<Date | null>(
        (latest, r) => (r.sentAt && (!latest || r.sentAt > latest) ? r.sentAt : latest),
        null,
      ),
    },
    invoices: client ? await client.listInvoices(agencyId) : null,
  };
}

/** For /admin: the overview of one agency (by id or URL name) and the plans it could be put on (null when they cannot be listed). */
export async function getAdminBilling(
  agencyRef: string,
): Promise<{ overview: BillingOverview; plans: BillingPlan[] | null }> {
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  const [overview, plans] = await Promise.all([
    getBillingOverview(agency.id),
    getBillingClient() ? listAssignablePlans().catch(() => null) : null,
  ]);
  return { overview, plans };
}

export async function listAssignablePlans(): Promise<BillingPlan[]> {
  const client = getBillingClient();
  if (!client) throw notConnected();
  try {
    return await client.listPlans();
  } catch (error) {
    throw unreachable(error);
  }
}

const notConnected = () =>
  new ApiError('billing_not_connected', 'Billing Server is not connected', { status: 409 });
const unreachable = (error: unknown) =>
  new ApiError('billing_unreachable', `Billing Server could not be reached (${errorCode(error)})`, {
    status: 502,
  });

/**
 * Reads the agency's subscription and limits from Billing Server and caches them on the agency
 * (`Agency.plan` and `Agency.billing`). If the server cannot be read the previous values stay and the
 * error is recorded, so a Billing Server outage never removes a plan or a seat limit.
 */
export async function syncAgencyBilling(
  agencyId: string,
  client: BillingClient,
  now: Date = new Date(),
): Promise<BillingState> {
  const current = await withAgency(agencyId, async (tx) =>
    parseBillingState(
      (await tx.agency.findUnique({ where: { id: agencyId }, select: { billing: true } }))?.billing,
    ),
  );
  const state = await client.getState(agencyId);
  if (!state) {
    const failed = { ...current, error: 'unreadable', syncedAt: now.toISOString() };
    await withAgency(agencyId, (tx) =>
      tx.agency.update({
        where: { id: agencyId },
        data: { billing: failed as Prisma.InputJsonValue },
      }),
    );
    return failed;
  }
  let next: BillingState = parseBillingState({
    seatLimit: null,
    syncedAt: now.toISOString(),
    error: null,
  });
  let planLabel: string | null = null;
  if (state.subscription) {
    const plans = await client.listPlans().catch(() => [] as BillingPlan[]);
    const plan = plans.find((p) => p.id === state.subscription!.planId);
    const seats = state.limits.find((l) => l.metric === BILLING_METRICS.seats && l.type === 'hard');
    planLabel = plan?.role ?? plan?.name ?? state.subscription.planId;
    next = parseBillingState({
      planId: state.subscription.planId,
      planName: plan?.name,
      planRole: plan?.role ?? undefined,
      subscriptionId: state.subscription.id,
      status: state.subscription.status,
      seatLimit: seats?.limit ?? null,
      syncedAt: now.toISOString(),
      error: null,
    });
  }
  await withAgency(agencyId, (tx) =>
    tx.agency.update({
      where: { id: agencyId },
      data: { plan: planLabel, billing: next as Prisma.InputJsonValue },
    }),
  );
  return next;
}

/**
 * A platform owner or admin puts an agency on a plan (US-1308). Billing Server only creates a
 * subscription here: an agency already on another plan has to be moved in Billing Server, and this says
 * so instead of guessing. The cache is refreshed straight after.
 */
export async function assignAgencyPlan(
  actor: PlatformAdminActor,
  agencyRef: string,
  planId: string,
): Promise<BillingState> {
  const client = getBillingClient();
  if (!client) throw notConnected();
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  let outcome: Awaited<ReturnType<BillingClient['createSubscription']>>;
  try {
    const existing = await client.getState(agency.id);
    if (!existing) throw new BillingError('unreadable', 0);
    if (existing.subscription && existing.subscription.planId !== planId) {
      throw new ApiError(
        'plan_change_unsupported',
        'This agency already has a subscription on another plan. Change it in Billing Server.',
        { status: 409 },
      );
    }
    outcome = await client.createSubscription(agency.id, planId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof BillingError && error.status === 404) {
      throw new ApiError('not_found', 'Billing Server does not know this plan', { status: 404 });
    }
    throw unreachable(error);
  }
  const state = await syncAgencyBilling(agency.id, client);
  await withAgency(agency.id, async (tx) => {
    await tx.activityLog.create({
      data: {
        agencyId: agency.id,
        actorType: 'platform_admin',
        actorId: actor.userId,
        action: 'billing.plan_assigned',
        entityType: 'agency',
        entityId: agency.id,
        data: { planId, result: outcome.status },
      },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'billing.plan_assigned',
      agencyId: agency.id,
      targetType: 'agency',
      targetId: agency.id,
      data: { planId, result: outcome.status },
    });
  });
  return state;
}

/** Refreshes one agency's cached plan on request. */
export async function refreshAgencyBilling(
  actor: PlatformAdminActor,
  agencyRef: string,
): Promise<BillingState> {
  const client = getBillingClient();
  if (!client) throw notConnected();
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  const state = await syncAgencyBilling(agency.id, client);
  await withAgency(agency.id, (tx) =>
    recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'billing.refresh',
      agencyId: agency.id,
      targetType: 'agency',
      targetId: agency.id,
    }),
  );
  return state;
}

/**
 * Refuses a new invitation (or a reactivation) when the plan has no free seat. Seats counted are
 * active members plus invitations still open. Uses the last synced limit, so a Billing Server outage
 * never blocks the agency; an agency with no known seat limit is not limited.
 */
export async function assertSeatAvailable(
  tx: ScopedTx,
  agencyId: string,
  now: Date = new Date(),
): Promise<void> {
  const row = await tx.agency.findUnique({ where: { id: agencyId }, select: { billing: true } });
  const limit = parseBillingState(row?.billing).seatLimit;
  if (limit === null) return;
  const { active, pending } = await seatCounts(tx, agencyId, now);
  if (active + pending >= limit) {
    throw new ApiError(
      'seat_limit_reached',
      'Your plan has no free seat. Ask Team of Wakers to change your plan.',
      { status: 402 },
    );
  }
}

export interface UsageRunResult {
  created: number;
  sent: number;
  failed: number;
}

async function send(
  client: BillingClient,
  agencyId: string,
  report: { id: string; metric: string; quantity: number; idempotencyKey: string },
  now: Date,
): Promise<boolean> {
  try {
    await client.reportUsage({
      agencyId,
      metric: report.metric,
      quantity: report.quantity,
      idempotencyKey: report.idempotencyKey,
    });
    await withAgency(agencyId, (tx) =>
      tx.billingUsageReport.update({
        where: { id: report.id },
        data: { status: 'sent', sentAt: now, error: null, attempts: { increment: 1 } },
      }),
    );
    return true;
  } catch (error) {
    await withAgency(agencyId, (tx) =>
      tx.billingUsageReport.update({
        where: { id: report.id },
        data: { status: 'failed', error: errorCode(error), attempts: { increment: 1 } },
      }),
    );
    return false;
  }
}

/**
 * Tells Billing Server what one agency used (ADR-013): the growth in this month's AI cost, in whole
 * cents (the sub-cent remainder carries over, so a month adds up to the ledger), and today's active
 * seats. Each report is written first with its idempotency key and then sent, so a crash or a retry
 * never counts twice. Reports that failed earlier are sent again, up to ten attempts.
 */
export async function reportAgencyUsage(
  agencyId: string,
  client: BillingClient,
  now: Date = new Date(),
): Promise<UsageRunResult> {
  const month = monthKey(now);
  const day = dayKey(now);
  const todo = await withAgency(agencyId, async (tx) => {
    const spent = (await getBudgetStatus(tx, agencyId, now)).spentUsd;
    const spentCents = Math.floor(spent * 100 + 1e-9);
    const earlier = await tx.billingUsageReport.findMany({
      where: { metric: BILLING_METRICS.aiCostCents, periodKey: month },
    });
    const already = earlier.reduce((sum, r) => sum + r.quantity, 0);
    const created: { id: string }[] = [];
    if (spentCents > already) {
      created.push(
        await tx.billingUsageReport.create({
          data: {
            agencyId,
            metric: BILLING_METRICS.aiCostCents,
            periodKey: month,
            quantity: spentCents - already,
            idempotencyKey: `${BILLING_METRICS.aiCostCents}:${agencyId}:${month}:${spentCents}`,
          },
          select: { id: true },
        }),
      );
    }
    const seats = await tx.membership.count({ where: { agencyId, active: true } });
    const seatKey = `${BILLING_METRICS.seats}:${agencyId}:${day}`;
    const seatDone = await tx.billingUsageReport.findUnique({
      where: { agencyId_idempotencyKey: { agencyId, idempotencyKey: seatKey } },
      select: { id: true },
    });
    if (seats > 0 && !seatDone) {
      created.push(
        await tx.billingUsageReport.create({
          data: {
            agencyId,
            metric: BILLING_METRICS.seats,
            periodKey: day,
            quantity: seats,
            idempotencyKey: seatKey,
          },
          select: { id: true },
        }),
      );
    }
    const open = await tx.billingUsageReport.findMany({
      where: { status: { in: ['pending', 'failed'] }, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
    });
    return { open, created: created.length };
  });
  let sent = 0;
  let failed = 0;
  for (const report of todo.open) {
    if (await send(client, agencyId, report, now)) sent += 1;
    else failed += 1;
  }
  return { created: todo.created, sent, failed };
}

/** Worker job `maintenance:billing.report`, once a day: usage out, plan state back, for every active agency. */
export async function runBillingJob(
  ctx: JobContext,
  overrides: { client?: BillingClient | null; now?: Date } = {},
): Promise<void> {
  const client = overrides.client === undefined ? getBillingClient() : overrides.client;
  if (!client) {
    await ctx.progress({ skipped: 'billing_not_connected' });
    return;
  }
  const now = overrides.now ?? new Date();
  const totals = { agencies: 0, created: 0, sent: 0, failed: 0, errors: 0 };
  for (const agencyId of await listActiveAgencyIds()) {
    totals.agencies += 1;
    try {
      const hasSubscription = await withAgency(agencyId, async (tx) =>
        Boolean(
          parseBillingState(
            (await tx.agency.findUnique({ where: { id: agencyId }, select: { billing: true } }))
              ?.billing,
          ).subscriptionId,
        ),
      );
      if (hasSubscription) {
        const run = await reportAgencyUsage(agencyId, client, now);
        totals.created += run.created;
        totals.sent += run.sent;
        totals.failed += run.failed;
      }
      await syncAgencyBilling(agencyId, client, now);
    } catch {
      totals.errors += 1; // one agency never stops the others
    }
  }
  await ctx.progress(totals);
}
