// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { UnrecoverableError } from 'bullmq';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  MAX_BATCH_ANALYSIS,
  batchAnalysisInputSchema,
  type AgencyActor,
  type BatchProgress,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { ApiError } from '@/lib/http/errors';
import { createClient } from '@/server/clients/service';
import { fakeMatchRunner, readyMatchEntry } from '@/test/match-fixtures';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import type { JobContext } from '@/worker/registry';
import { runBatchJob, validateBatch } from './batch';

describe('batch analysis input', () => {
  it('takes 1 to 50 different candidates', () => {
    const id = () => randomUUID();
    expect(batchAnalysisInputSchema.safeParse({ entryIds: [id()] }).success).toBe(true);
    expect(batchAnalysisInputSchema.safeParse({ entryIds: [] }).success).toBe(false);
    expect(
      batchAnalysisInputSchema.safeParse({
        entryIds: Array.from({ length: MAX_BATCH_ANALYSIS + 1 }, id),
      }).success,
    ).toBe(false);
    expect(
      batchAnalysisInputSchema.safeParse({
        entryIds: Array.from({ length: MAX_BATCH_ANALYSIS }, id),
      }).success,
    ).toBe(true);
    const same = id();
    expect(batchAnalysisInputSchema.safeParse({ entryIds: [same, same] }).success).toBe(false);
    expect(batchAnalysisInputSchema.safeParse({ entryIds: ['nope'] }).success).toBe(false);
  });
});

describe.skipIf(!dbAvailable())('batch analysis (T-3-05)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const ctxFor = (
    data: unknown,
    over: Partial<JobContext> = {},
  ): JobContext & { reports: BatchProgress[] } => {
    const reports: BatchProgress[] = [];
    return {
      jobRunId: randomUUID(),
      agencyId,
      requestedById: owner.userId,
      data,
      attempt: 1,
      withAgency: run,
      progress: async (p) => void reports.push(structuredClone(p as unknown as BatchProgress)),
      reports,
      ...over,
    };
  };
  const entries = async (n: number, positionId?: string) => {
    const made: Awaited<ReturnType<typeof readyMatchEntry>>[] = [];
    for (let i = 0; i < n; i++)
      made.push(
        await readyMatchEntry(run, owner, clientId, {
          positionId: i === 0 ? positionId : (made[0]?.positionId ?? positionId),
        }),
      );
    return made;
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(4);
    agencyId = await createAgency(admin, 'Batch A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyId, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, owner, { name: 'Batch Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  describe('validating the request', () => {
    it('accepts candidates of this position that the person may analyze', async () => {
      const [a, b] = await entries(2);
      await expect(
        run((tx) => validateBatch(tx, owner, a!.positionId, [a!.entry.id, b!.entry.id])),
      ).resolves.toBeUndefined();
    });

    it('refuses the whole request when one candidate belongs to another position (422), is not the person’s to analyze (403) or does not exist (404)', async () => {
      const [a] = await entries(1);
      const [elsewhere] = await entries(1);
      await expect(
        run((tx) => validateBatch(tx, owner, a!.positionId, [a!.entry.id, elsewhere!.entry.id])),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        run((tx) => validateBatch(tx, other, a!.positionId, [a!.entry.id])),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        run((tx) => validateBatch(tx, owner, a!.positionId, [a!.entry.id, randomUUID()])),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('the job', () => {
    it('analyzes every candidate and reports the state of each after every step', async () => {
      const made = await entries(4);
      const ids = made.map((m) => m.entry.id);
      const ctx = ctxFor({ positionId: made[0]!.positionId, entryIds: ids });
      const result = await runBatchJob(ctx, fakeMatchRunner(run, agencyId, owner.userId));
      expect(result).toMatchObject({ total: 4, completed: 4, failed: 0, skipped: 0 });
      expect(Object.values(result.entries).every((e) => e.status === 'done' && e.analysisId)).toBe(
        true,
      );
      expect(ctx.reports[0]!.entries[ids[0]!]).toEqual({ status: 'pending' });
      expect(ctx.reports.at(-1)!.completed).toBe(4);
      // Completed only ever goes up, so a progress bar never moves backwards.
      const done = ctx.reports.map((r) => r.completed);
      expect(done).toEqual([...done].sort((x, y) => x - y));
      const rows = await admin.query(
        `SELECT count(*)::int AS n FROM "MatchAnalysis" WHERE "entryId" = ANY($1::uuid[])`,
        [ids],
      );
      expect(rows.rows[0].n).toBe(4);
    });

    it('runs a few at a time, not all at once and not one by one', async () => {
      const made = await entries(6);
      let active = 0;
      let peak = 0;
      const gated = fakeMatchRunner(run, agencyId, owner.userId, undefined, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
      });
      await runBatchJob(
        ctxFor({ positionId: made[0]!.positionId, entryIds: made.map((m) => m.entry.id) }),
        gated,
      );
      expect(peak).toBe(3);
    });

    it('carries on when one candidate cannot be analyzed, and says why', async () => {
      const [ok1, ok2] = await entries(2);
      const noProfile = await readyMatchEntry(run, owner, clientId, {
        positionId: ok1!.positionId,
        approveProfile: false,
      });
      const result = await runBatchJob(
        ctxFor({
          positionId: ok1!.positionId,
          entryIds: [ok1!.entry.id, noProfile.entry.id, ok2!.entry.id],
        }),
        fakeMatchRunner(run, agencyId, owner.userId),
      );
      expect(result).toMatchObject({ total: 3, completed: 2, failed: 1 });
      expect(result.entries[noProfile.entry.id]).toEqual({ status: 'failed', reason: 'conflict' });
    });

    it('stops spending when the AI budget is used: the rest are skipped, the job ends normally', async () => {
      const made = await entries(5);
      const ids = made.map((m) => m.entry.id);
      let calls = 0;
      const base = fakeMatchRunner(run, agencyId, owner.userId);
      const budget = vi.fn(async (...args: Parameters<typeof base>) => {
        calls++;
        if (calls >= 2) throw new ApiError('budget_exceeded', 'Budget used', { status: 402 });
        return base(...args);
      }) as unknown as typeof base;
      const result = await runBatchJob(
        ctxFor({ positionId: made[0]!.positionId, entryIds: ids }),
        budget,
      );
      expect(result.completed + result.failed + result.skipped).toBe(5);
      expect(result.skipped).toBeGreaterThanOrEqual(3);
      expect(
        Object.values(result.entries)
          .filter((e) => e.status === 'skipped')
          .every((e) => e.reason === 'budget_exceeded'),
      ).toBe(true);
      expect(calls).toBeLessThanOrEqual(3 + 1); // no new calls after the budget was hit, apart from those already running
    });

    it('does not run without a person who asked, or for someone who left the agency', async () => {
      const [a] = await entries(1);
      const data = { positionId: a!.positionId, entryIds: [a!.entry.id] };
      const gateway = vi.fn();
      await expect(
        runBatchJob(ctxFor(data, { requestedById: null }), gateway as never),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      await expect(
        runBatchJob(ctxFor(data, { requestedById: randomUUID() }), gateway as never),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(gateway).not.toHaveBeenCalled();
    });

    it('only analyzes what the person may: a candidate they do not own fails with 403 and is not sent to the model', async () => {
      const [a] = await entries(1);
      const gateway = vi.fn();
      const ctx = ctxFor(
        { positionId: a!.positionId, entryIds: [a!.entry.id] },
        { requestedById: other.userId },
      );
      const result = await runBatchJob(ctx, gateway as never);
      expect(result.entries[a!.entry.id]).toEqual({ status: 'failed', reason: 'forbidden' });
      expect(gateway).not.toHaveBeenCalled();
    });
  });
});
