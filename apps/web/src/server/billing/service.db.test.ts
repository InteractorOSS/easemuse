// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AgencyActor, PlatformAdminActor } from '@easemuse/core';
import { closeDb, withAgency } from '@/lib/db';
import { createInvite, updateMember } from '@/server/tenancy/members';
import { adminClient, cleanup, createAgency, createUser, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import type { JobContext } from '@/worker/registry';
import { createRecordingBillingFake, type RecordingBillingFake } from './fake';
import { setBillingClientForTests } from './index';
import {
  assertSeatAvailable,
  assignAgencyPlan,
  getBillingOverview,
  refreshAgencyBilling,
  reportAgencyUsage,
  runBillingJob,
  syncAgencyBilling,
} from './service';
import { BillingError } from './types';

describe.skipIf(!dbAvailable())('plans, seats and usage through Billing Server (T-13-08)', () => {
  let admin: pg.Client;
  let agencyId: string;
  let slug: string;
  let platform: PlatformAdminActor;
  let actor: AgencyActor;
  let fake: RecordingBillingFake;
  const users: string[] = [];
  const now = new Date('2026-10-08T12:00:00Z');

  const cost = (usd: number, at = now) =>
    admin.query(
      `INSERT INTO "LlmCall" (id, "agencyId", purpose, model, "promptVersion", "inputTokens", "outputTokens", "costUsd", "latencyMs", "createdAt")
       VALUES (gen_random_uuid(), $1, 'jd.structure', 'm', 'v1', 1, 1, $2, 1, $3)`,
      [agencyId, usd, at],
    );
  const reports = async () =>
    (
      await admin.query(
        'SELECT metric, quantity, status, attempts, "idempotencyKey" FROM "BillingUsageReport" WHERE "agencyId" = $1 ORDER BY "createdAt"',
        [agencyId],
      )
    ).rows;
  const addMember = async (active = true) => {
    const userId = await createUser(admin);
    users.push(userId);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', $3, now())`,
      [agencyId, userId, active],
    );
    return userId;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    agencyId = await createAgency(admin, 'Billing A');
    slug = (await admin.query('SELECT slug FROM "Agency" WHERE id = $1', [agencyId])).rows[0].slug;
    const [p, u] = [await createUser(admin), await createUser(admin)];
    users.push(p, u);
    platform = { kind: 'platform_admin', userId: p, role: 'admin' };
    actor = { kind: 'agency', userId: u, agencyId, role: 'admin' };
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'admin', true, now())`,
      [agencyId, u],
    );
    fake = createRecordingBillingFake();
  });
  beforeEach(() => {
    fake.failWith(null);
    setBillingClientForTests(fake);
  });
  afterAll(async () => {
    setBillingClientForTests(undefined);
    await cleanup(admin, { agencies: [agencyId], users });
    await admin.end();
    await closeDb();
  });

  it('says plainly when Billing Server is not connected', async () => {
    setBillingClientForTests(null);
    const overview = await getBillingOverview(agencyId, now);
    expect(overview).toMatchObject({ connected: false, plan: null, invoices: null });
    await expect(assignAgencyPlan(platform, slug, 'plan-team')).rejects.toMatchObject({
      status: 409,
      code: 'billing_not_connected',
    });
  });

  it('puts an agency on a plan, caches the plan and the seat limit, and logs it in both logs', async () => {
    const state = await assignAgencyPlan(platform, slug, 'plan-starter');
    expect(state).toMatchObject({
      planName: 'Starter',
      planRole: 'easemuse_starter',
      seatLimit: 3,
      error: null,
    });
    const row = (await admin.query('SELECT plan, billing FROM "Agency" WHERE id = $1', [agencyId]))
      .rows[0];
    expect(row.plan).toBe('easemuse_starter');
    expect(row.billing.subscriptionId).toBeTruthy();
    expect(fake.calls.filter((c) => c.method === 'createSubscription')).toHaveLength(1);
    const activity = await admin.query(
      `SELECT 1 FROM "ActivityLog" WHERE "agencyId" = $1 AND action = 'billing.plan_assigned'`,
      [agencyId],
    );
    const audit = await admin.query(
      `SELECT 1 FROM "PlatformAuditLog" WHERE "agencyId" = $1 AND action = 'billing.plan_assigned'`,
      [agencyId],
    );
    expect([activity.rowCount, audit.rowCount]).toEqual([1, 1]);
  });

  it('is safe to assign the same plan again and refuses to move an agency to another plan', async () => {
    await expect(assignAgencyPlan(platform, slug, 'plan-starter')).resolves.toMatchObject({
      planName: 'Starter',
    });
    await expect(assignAgencyPlan(platform, slug, 'plan-team')).rejects.toMatchObject({
      status: 409,
      code: 'plan_change_unsupported',
    });
  });

  it('says 404 for a plan Billing Server does not know', async () => {
    const other = await createAgency(admin, 'Billing Other');
    try {
      const otherSlug = (await admin.query('SELECT slug FROM "Agency" WHERE id = $1', [other]))
        .rows[0].slug;
      await expect(assignAgencyPlan(platform, otherSlug, 'nope')).rejects.toMatchObject({
        status: 404,
      });
    } finally {
      await cleanup(admin, { agencies: [other] });
    }
  });

  it('keeps the plan and seat limit when Billing Server cannot be read, and records why', async () => {
    fake.failWith(new BillingError('down', 503));
    const state = await syncAgencyBilling(agencyId, fake, now);
    expect(state).toMatchObject({ planName: 'Starter', seatLimit: 3, error: 'unreadable' });
    await expect(assignAgencyPlan(platform, slug, 'plan-starter')).rejects.toMatchObject({
      status: 502,
    });
    fake.failWith(null);
    expect((await refreshAgencyBilling(platform, slug)).error).toBeNull();
  });

  it('refuses a new invitation or a reactivation when the plan has no free seat, and allows it again with room', async () => {
    // One admin is active; the Starter plan allows 3 seats.
    const second = await addMember();
    const dormant = await addMember(false);
    const invite = { email: 'new@x.test', role: 'recruiter' } as const;
    await expect(createInvite(actor, { slug, name: 'Billing A' }, invite)).resolves.toBeTruthy();
    // 2 active + 1 pending = 3: full.
    await expect(
      createInvite(actor, { slug, name: 'Billing A' }, { email: 'more@x.test', role: 'recruiter' }),
    ).rejects.toMatchObject({ status: 402, code: 'seat_limit_reached' });
    await expect(updateMember(actor, dormant, { active: true })).rejects.toMatchObject({
      code: 'seat_limit_reached',
    });
    // Turning someone off frees a seat.
    await updateMember(actor, second, { active: false });
    await expect(updateMember(actor, dormant, { active: true })).resolves.toMatchObject({
      active: true,
    });
    const overview = await getBillingOverview(agencyId, now);
    expect(overview.seats).toEqual({ active: 2, pending: 1, limit: 3 });
  });

  it('does not limit an agency with no known seat limit', async () => {
    await admin.query(`UPDATE "Agency" SET billing = '{}' WHERE id = $1`, [agencyId]);
    await expect(
      withAgency(agencyId, (tx) => assertSeatAvailable(tx, agencyId, now)),
    ).resolves.toBeUndefined();
    await syncAgencyBilling(agencyId, fake, now);
  });

  describe('usage', () => {
    it("reports the growth in AI cost in whole cents and today's seats, once", async () => {
      await cost(1.234, new Date('2026-10-03T00:00:00Z'));
      const first = await reportAgencyUsage(agencyId, fake, now);
      expect(first).toEqual({ created: 2, sent: 2, failed: 0 });
      expect(fake.reports.map((r) => [r.metric, r.quantity])).toEqual([
        ['ai_cost_cents', 123],
        ['seats', 2],
      ]);

      // Nothing new: nothing sent again.
      expect(await reportAgencyUsage(agencyId, fake, now)).toEqual({
        created: 0,
        sent: 0,
        failed: 0,
      });

      // More spend: only the growth goes out, and the sub-cent remainder carries over.
      await cost(0.5, new Date('2026-10-10T00:00:00Z'));
      expect(await reportAgencyUsage(agencyId, fake, now)).toMatchObject({ created: 1, sent: 1 });
      expect(
        fake.reports.filter((r) => r.metric === 'ai_cost_cents').map((r) => r.quantity),
      ).toEqual([123, 50]);
      const total = (await reports())
        .filter((r) => r.metric === 'ai_cost_cents')
        .reduce((s, r) => s + r.quantity, 0);
      expect(total).toBe(Math.floor((1.234 + 0.5) * 100));
    });

    it('sends the same key again after a failure, so the server counts it once', async () => {
      await cost(0.3, new Date('2026-10-12T00:00:00Z'));
      fake.failWith(new BillingError('down', 500));
      const down = await reportAgencyUsage(agencyId, fake, now);
      expect(down).toMatchObject({ created: 1, sent: 0, failed: 1 });
      const stuck = (await reports()).find((r) => r.status === 'failed')!;
      expect(stuck.attempts).toBe(1);
      const overview = await getBillingOverview(agencyId, now);
      expect(overview.usage.failedReports).toBe(1);

      fake.failWith(null);
      const up = await reportAgencyUsage(agencyId, fake, now);
      expect(up).toMatchObject({ created: 0, sent: 1, failed: 0 });
      const sent = fake.reports.filter((r) => r.idempotencyKey === stuck.idempotencyKey);
      expect(sent).toHaveLength(1);
      // Sending the identical report again is accepted but not counted twice.
      await fake.reportUsage(sent[0]!);
      expect(fake.reports.filter((r) => r.idempotencyKey === stuck.idempotencyKey)).toHaveLength(1);
    });

    it('is shown in the overview with the invoices, and the daily job does the same for every subscribed agency', async () => {
      fake.setInvoices(agencyId, [
        {
          id: 'c1',
          kind: 'subscription',
          amount: '99.00',
          currency: 'USD',
          status: 'paid',
          periodStart: '2026-09-01',
          periodEnd: '2026-10-01',
          issuedAt: '2026-10-01',
          paidAt: '2026-10-02',
        },
      ]);
      await cost(0.2, new Date('2026-10-14T00:00:00Z'));
      const progress: Record<string, unknown>[] = [];
      const ctx = {
        jobRunId: randomUUID(),
        agencyId: null,
        requestedById: null,
        data: null,
        attempt: 1,
        withAgency: async () => {
          throw new Error('system job');
        },
        progress: async (p: Record<string, unknown>) => void progress.push(p),
      } as unknown as JobContext;
      await runBillingJob(ctx, { client: fake, now });
      // The test database is shared, so other agencies may be in the run: look at this agency only.
      expect((progress.at(-1) as { agencies: number }).agencies).toBeGreaterThanOrEqual(1);
      const overview = await getBillingOverview(agencyId, now);
      expect(overview.connected).toBe(true);
      expect(overview.invoices).toHaveLength(1);
      expect(overview.usage.reportedCents).toBeGreaterThan(100);
      expect(overview.plan).toMatchObject({ name: 'Starter', status: 'active' });
    });

    it('does nothing while billing is not connected', async () => {
      const progress: Record<string, unknown>[] = [];
      await runBillingJob(
        {
          progress: async (p: Record<string, unknown>) => void progress.push(p),
        } as unknown as JobContext,
        { client: null, now },
      );
      expect(progress).toEqual([{ skipped: 'billing_not_connected' }]);
    });
  });
});
