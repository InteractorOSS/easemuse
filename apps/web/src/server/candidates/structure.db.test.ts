// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { UnrecoverableError } from 'bullmq';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/http/errors';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import type { JobContext } from '@/worker/registry';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { extractCandidateDocument } from './extract';
import { createCandidateDraft } from './intake';
import {
  planProfileStructure,
  runProfileStructure,
  structureCandidateJob,
  MAX_SOURCE_CHARS,
} from './structure';

const RESUME = `Alex Kim\nDate of Birth: 12 March 1985\nGender: Male\nSenior HR Director, Northwind (2019-present)\nLed a team of 12 across payroll and benefits.\nHR Manager, Contoso (2014-2019)\nBA Business Administration, 2010\nSkills: payroll, compliance`;
const fakeResult = {
  generationId: 'g',
  output: {},
  draft: { artifactId: 'a1', versionId: 'v1', version: 1 },
  usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
  costUsd: 0,
};

describe.skipIf(!dbAvailable())('candidate profile structuring (T-2-03)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let actor: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const ctxFor = (data: unknown, over: Partial<JobContext> = {}): JobContext => ({
    jobRunId: randomUUID(),
    agencyId,
    requestedById: actor.userId,
    data,
    attempt: 1,
    withAgency: run,
    progress: vi.fn(async () => undefined),
    ...over,
  });
  /** A draft whose text has been read, as the intake job leaves it. */
  const readyDraft = async (text = RESUME) => {
    const draft = await run((tx) =>
      createCandidateDraft(
        tx,
        actor,
        { source: 'linkedin' },
        {
          filename: `${randomUUID()}.txt`,
          bytes: new TextEncoder().encode(`${text}\n${randomUUID()}`),
          kind: 'resume',
        },
      ),
    );
    await extractCandidateDocument(ctxFor({ documentId: draft.documentId }));
    return draft;
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Structure Cand A');
    const userId = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
      [agencyId, userId],
    );
    actor = { kind: 'agency', userId, agencyId, role: 'recruiter' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('plans from the text that was read, with protected characteristics removed before the model sees it', async () => {
    const { candidateId, documentId } = await readyDraft();
    const plan = await run((tx) => planProfileStructure(tx, candidateId));
    expect(plan.input.source).toBe('linkedin');
    expect(plan.input.sourceText).toContain('Senior HR Director, Northwind');
    expect(plan.input.sourceText).not.toMatch(/Date of Birth|Gender/);
    expect(plan.inputRefs).toMatchObject({
      candidateId,
      documentIds: [documentId],
      truncated: false,
    });
    expect(plan.inputRefs.redactedCategories.sort()).toEqual(['age', 'gender']);
    // The stored original is not touched.
    const original = await admin.query(
      `SELECT "extractedText" FROM "CandidateDocument" WHERE id = $1`,
      [documentId],
    );
    expect(original.rows[0].extractedText).toContain('Date of Birth: 12 March 1985');
  });

  it('refuses with 422 until some text has been read, and 404 for a discarded or unknown candidate', async () => {
    const pending = await run((tx) =>
      createCandidateDraft(
        tx,
        actor,
        { source: 'other' },
        {
          filename: `${randomUUID()}.txt`,
          bytes: new TextEncoder().encode(`${RESUME} ${randomUUID()}`),
          kind: 'resume',
        },
      ),
    );
    await expect(run((tx) => planProfileStructure(tx, pending.candidateId))).rejects.toMatchObject({
      status: 422,
    });
    await expect(run((tx) => planProfileStructure(tx, randomUUID()))).rejects.toMatchObject({
      status: 404,
    });
    await admin.query(`UPDATE "Candidate" SET status = 'discarded' WHERE id = $1`, [
      pending.candidateId,
    ]);
    await expect(run((tx) => planProfileStructure(tx, pending.candidateId))).rejects.toMatchObject({
      status: 404,
    });
  });

  it('cuts a very long text and says so', async () => {
    const { candidateId } = await readyDraft(`${'Experienced professional. '.repeat(4000)}`);
    const plan = await run((tx) => planProfileStructure(tx, candidateId));
    expect(plan.inputRefs.truncated).toBe(true);
    expect(plan.input.sourceText.length).toBe(MAX_SOURCE_CHARS);
  });

  it('runs the gateway for the candidate as its subject, with the provenance of the documents used', async () => {
    const { candidateId } = await readyDraft();
    const plan = await run((tx) => planProfileStructure(tx, candidateId));
    const gateway = vi.fn(async () => fakeResult);
    await runProfileStructure(gateway, actor, plan);
    expect(gateway).toHaveBeenCalledWith(
      'profile.structure',
      plan.input,
      expect.objectContaining({
        agencyId,
        actor,
        subject: { type: 'candidate', id: candidateId },
        inputRefs: plan.inputRefs,
      }),
    );
  });

  describe('the worker job', () => {
    it('runs A7 as the person who asked, with their role, and reports the draft', async () => {
      const { candidateId } = await readyDraft();
      const gateway = vi.fn(async () => fakeResult);
      const ctx = ctxFor({ candidateId });
      await structureCandidateJob(ctx, gateway);
      expect(gateway).toHaveBeenCalledWith(
        'profile.structure',
        expect.anything(),
        expect.objectContaining({
          actor: expect.objectContaining({ userId: actor.userId, role: 'recruiter' }),
        }),
      );
      expect(ctx.progress).toHaveBeenCalledWith({ status: 'ready', candidateId, artifactId: 'a1' });
    });

    it('does not run without a person who asked, or when that person has left the agency', async () => {
      const { candidateId } = await readyDraft();
      const gateway = vi.fn(async () => fakeResult);
      await expect(
        structureCandidateJob(ctxFor({ candidateId }, { requestedById: null }), gateway),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      await expect(
        structureCandidateJob(ctxFor({ candidateId }, { requestedById: randomUUID() }), gateway),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(gateway).not.toHaveBeenCalled();
    });

    it('stops for good on a refusal retrying cannot fix (budget used), but retries a transient failure', async () => {
      const { candidateId } = await readyDraft();
      const budget = vi.fn(async () => {
        throw new ApiError('budget_exceeded', 'Budget used', { status: 402 });
      });
      const ctx = ctxFor({ candidateId });
      await expect(structureCandidateJob(ctx, budget)).rejects.toBeInstanceOf(UnrecoverableError);
      expect(ctx.progress).toHaveBeenCalledWith({
        status: 'failed',
        candidateId,
        reason: 'budget_exceeded',
      });
      const flaky = vi.fn(async () => {
        throw new Error('connection reset');
      });
      await expect(structureCandidateJob(ctxFor({ candidateId }), flaky)).rejects.toThrow(
        'connection reset',
      );
    });
  });

  it('starts the AI step once the text is saved, and not when reading failed', async () => {
    const afterRead = vi.fn(async () => undefined);
    const ok = await run((tx) =>
      createCandidateDraft(
        tx,
        actor,
        { source: 'other' },
        {
          filename: `${randomUUID()}.txt`,
          bytes: new TextEncoder().encode(`${RESUME} ${randomUUID()}`),
          kind: 'resume',
        },
      ),
    );
    await extractCandidateDocument(ctxFor({ documentId: ok.documentId }), { afterRead });
    expect(afterRead).toHaveBeenCalledWith({
      candidateId: ok.candidateId,
      documentId: ok.documentId,
    });
    const bad = await run((tx) =>
      createCandidateDraft(
        tx,
        actor,
        { source: 'other' },
        {
          filename: `${randomUUID()}.txt`,
          bytes: new TextEncoder().encode('too short'),
          kind: 'resume',
        },
      ),
    );
    await extractCandidateDocument(ctxFor({ documentId: bad.documentId }), { afterRead });
    expect(afterRead).toHaveBeenCalledTimes(1);
  });
});
