// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { AiProviderError } from '@/server/ai/errors';
import { addDraftVersion, approveVersion } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import {
  candidateWithProfile,
  fakeEmbedder,
  indexCandidate,
  positionWithProfile,
  profileOf,
} from '@/test/pool-fixtures';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import {
  NotVisibleYetError,
  indexVersion,
  missingEmbeddings,
  runEmbeddingCatchUp,
} from './indexing';
import { resetEmbeddingScheduler, setEmbeddingScheduler } from './trigger';

describe.skipIf(!dbAvailable())('indexing profiles for pool search (T-2-16)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let otherAgencyId: string;
  let actor: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const ctx = () => ({ agencyId, withAgency: run });
  const vectors = async (where = '') =>
    (
      await admin.query<{ kind: string; subjectId: string; versionId: string; model: string }>(
        `SELECT "kind", "subjectId", "versionId", "model" FROM "ProfileEmbedding" WHERE "agencyId" = $1 ${where}`,
        [agencyId],
      )
    ).rows;

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(4);
    agencyId = await createAgency(admin, 'Index A');
    otherAgencyId = await createAgency(admin, 'Index B');
    const userId = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'admin', true, now())`,
      [agencyId, userId],
    );
    actor = { kind: 'agency', userId, agencyId, role: 'admin' };
    clientId = (await run((tx) => createClient(tx, actor, { name: 'Index Client' }))).client.id;
  });
  afterEach(() => resetEmbeddingScheduler());
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId, otherAgencyId] });
    await admin.end();
    await handle.close();
  });

  it('stores a 1024-dimension vector for an approved candidate profile and meters the cost', async () => {
    const embedder = fakeEmbedder();
    const { candidateId, versionId } = await candidateWithProfile(run, actor);
    expect(await indexCandidate(run, agencyId, embedder, candidateId, versionId)).toBe('indexed');

    expect(await vectors(`AND "subjectId" = '${candidateId}'`)).toEqual([
      { kind: 'candidate_profile', subjectId: candidateId, versionId, model: 'voyage-3-large' },
    ]);
    const { rows: dims } = await admin.query(
      `SELECT vector_dims("embedding") AS d FROM "ProfileEmbedding" WHERE "subjectId" = $1`,
      [candidateId],
    );
    expect(dims[0].d).toBe(1024);

    // Metered like every other AI cost, with nobody behind it (the one documented exception).
    const { rows: calls } = await admin.query(
      `SELECT "purpose", "model", "requestedById", "inputTokens", "outputTokens", "costUsd"::float8 AS cost
         FROM "LlmCall" WHERE "agencyId" = $1 AND "purpose" = 'embedding.index' ORDER BY "createdAt" DESC LIMIT 1`,
      [agencyId],
    );
    expect(calls[0]).toMatchObject({
      model: 'voyage-3-large',
      requestedById: null,
      outputTokens: 0,
    });
    expect(calls[0].cost).toBeCloseTo((calls[0].inputTokens * 0.18) / 1_000_000, 6);
    const { rows: generations } = await admin.query(
      `SELECT "requestedById", "status" FROM "AiGeneration" WHERE "agencyId" = $1 AND "purpose" = 'embedding.index' ORDER BY "createdAt" DESC LIMIT 1`,
      [agencyId],
    );
    expect(generations[0]).toEqual({ requestedById: null, status: 'succeeded' });
  });

  it('never sends the name, email, phone or links to Voyage', async () => {
    const embedder = fakeEmbedder();
    const { candidateId, versionId } = await candidateWithProfile(
      run,
      actor,
      profileOf({
        fullName: 'Zelda Quartermain',
        email: 'zelda.q@example.org',
        phone: '010-5555-4444',
      }),
    );
    await indexCandidate(run, agencyId, embedder, candidateId, versionId);
    const sent = embedder.sent();
    expect(sent).toContain('HR Director at Northwind');
    for (const secret of [
      'Zelda',
      'Quartermain',
      'zelda.q@example.org',
      '5555-4444',
      'alex.kim@example.com',
    ])
      expect(sent).not.toContain(secret);
    expect(embedder.calls[0]!.inputType).toBe('document');
  });

  it('keeps one vector per subject: a newer approved version replaces the older one', async () => {
    const embedder = fakeEmbedder();
    const first = await candidateWithProfile(run, actor);
    await indexCandidate(run, agencyId, embedder, first.candidateId, first.versionId);
    const artifact = await run((tx) =>
      tx.artifact.findFirstOrThrow({ where: { subjectId: first.candidateId } }),
    );
    const next = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content: profileOf({ currentPosition: { title: 'CHRO', company: 'Northwind' } }),
        origin: 'human',
        createdById: actor.userId,
      }),
    );
    await run((tx) => approveVersion(tx, actor, next.id));
    // The first version is now superseded: a late job for it stores nothing.
    expect(await indexCandidate(run, agencyId, embedder, first.candidateId, first.versionId)).toBe(
      'skipped_stale',
    );
    expect(await indexCandidate(run, agencyId, embedder, first.candidateId, next.id)).toBe(
      'indexed',
    );
    expect(
      (await vectors(`AND "subjectId" = '${first.candidateId}'`)).map((v) => v.versionId),
    ).toEqual([next.id]);
  });

  it('waits for a version that is not approved yet, and skips a candidate who is gone', async () => {
    const embedder = fakeEmbedder();
    const { candidateId } = await candidateWithProfile(run, actor);
    const artifact = await run((tx) =>
      tx.artifact.findFirstOrThrow({ where: { subjectId: candidateId } }),
    );
    const draft = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content: profileOf(),
        origin: 'human',
        createdById: actor.userId,
      }),
    );
    await expect(
      indexCandidate(run, agencyId, embedder, candidateId, draft.id),
    ).rejects.toBeInstanceOf(NotVisibleYetError);
    await expect(
      indexCandidate(run, agencyId, embedder, candidateId, crypto.randomUUID()),
    ).rejects.toBeInstanceOf(NotVisibleYetError);

    const gone = await candidateWithProfile(run, actor, {}, { status: 'discarded' });
    expect(await indexCandidate(run, agencyId, embedder, gone.candidateId, gone.versionId)).toBe(
      'skipped_subject',
    );
    expect(await vectors(`AND "subjectId" = '${gone.candidateId}'`)).toEqual([]);
  });

  it('indexes a success profile with the position title', async () => {
    const embedder = fakeEmbedder();
    const { positionId, versionId } = await positionWithProfile(run, actor, clientId, {
      title: 'Chief People Officer',
    });
    const outcome = await indexVersion(ctx(), embedder, {
      kind: 'success_profile',
      subjectId: positionId,
      versionId: versionId!,
    });
    expect(outcome).toBe('indexed');
    expect(embedder.sent()).toContain('Role: Chief People Officer (Seoul)');
    const { rows } = await admin.query(
      `SELECT "positionId" FROM "LlmCall" WHERE "agencyId" = $1 AND "purpose" = 'embedding.index' ORDER BY "createdAt" DESC LIMIT 1`,
      [agencyId],
    );
    expect(rows[0].positionId).toBe(positionId);
  });

  it('gives up for good, without retries, when there is no key or the budget is used', async () => {
    const { candidateId, versionId } = await candidateWithProfile(run, actor);
    const noKey = fakeEmbedder();
    noKey.failWith = new AiProviderError('No Voyage API key is configured.', false);
    await expect(
      indexCandidate(run, agencyId, noKey, candidateId, versionId),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    const flaky = fakeEmbedder();
    flaky.failWith = new AiProviderError('provider error 503', true, 503);
    await expect(
      indexCandidate(run, agencyId, flaky, candidateId, versionId),
    ).rejects.toBeInstanceOf(AiProviderError);

    await admin.query(`UPDATE "Agency" SET "aiMonthlyBudgetUsd" = 0 WHERE id = $1`, [agencyId]);
    try {
      await expect(
        indexCandidate(run, agencyId, fakeEmbedder(), candidateId, versionId),
      ).rejects.toThrow('budget_exceeded');
    } finally {
      await admin.query(`UPDATE "Agency" SET "aiMonthlyBudgetUsd" = NULL WHERE id = $1`, [
        agencyId,
      ]);
    }
    expect(await vectors(`AND "subjectId" = '${candidateId}'`)).toEqual([]);
  });

  describe('after an approval', () => {
    it('queues the indexing job for candidate and success profiles, and only those', async () => {
      const scheduled = vi.fn(async () => undefined);
      setEmbeddingScheduler(scheduled);
      const { candidateId, versionId } = await candidateWithProfile(run, actor);
      const { positionId, versionId: spVersion } = await positionWithProfile(run, actor, clientId);
      expect(scheduled).toHaveBeenCalledWith(agencyId, {
        kind: 'candidate_profile',
        subjectId: candidateId,
        versionId,
      });
      expect(scheduled).toHaveBeenCalledWith(agencyId, {
        kind: 'success_profile',
        subjectId: positionId,
        versionId: spVersion,
      });
      scheduled.mockClear();
      const artifact = await run((tx) =>
        tx.artifact.findFirstOrThrow({ where: { subjectId: candidateId } }),
      );
      await run((tx) =>
        addDraftVersion(tx, {
          agencyId,
          artifactId: artifact.id,
          content: profileOf(),
          origin: 'human',
          createdById: actor.userId,
        }),
      );
      expect(scheduled).not.toHaveBeenCalled(); // a draft is not an approval
    });

    it('does not block the approval when the queue is down', async () => {
      setEmbeddingScheduler(async () => {
        throw new Error('redis is down');
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await expect(candidateWithProfile(run, actor)).resolves.toBeDefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('embedding.schedule_failed'));
      warn.mockRestore();
    });
  });

  describe('nightly catch-up', () => {
    it('finds approved profiles that have no vector, and skips indexed, discarded and other agencies', async () => {
      const embedder = fakeEmbedder();
      const done = await candidateWithProfile(run, actor);
      await indexCandidate(run, agencyId, embedder, done.candidateId, done.versionId);
      const todo = await candidateWithProfile(run, actor);
      const discarded = await candidateWithProfile(run, actor, {}, { status: 'discarded' });

      const missing = await run((tx) => missingEmbeddings(tx, agencyId));
      const ids = missing.map((m) => m.subjectId);
      expect(ids).toContain(todo.candidateId);
      expect(ids).not.toContain(done.candidateId);
      expect(ids).not.toContain(discarded.candidateId);

      const schedule = vi.fn(async () => undefined);
      const result = await runEmbeddingCatchUp({
        agencyIds: async () => [agencyId, otherAgencyId],
        withAgency: (id, fn) => appScope(handle).withAgency(id, fn),
        schedule,
        now: () => new Date('2026-10-08T04:00:00Z'),
      });
      expect(result.queued).toBe(missing.length);
      expect(schedule).toHaveBeenCalledWith(
        agencyId,
        expect.objectContaining({ subjectId: todo.candidateId, versionId: todo.versionId }),
        { idempotencySuffix: ':2026-10-08' },
      );
    });
  });
});
