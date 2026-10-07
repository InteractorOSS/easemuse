// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import type { AgencyActor, BatchAnalysisInput, BatchProgress } from '@easemuse/core';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { requireEntry } from '@/server/pipeline/service';
import { requirePosition } from '@/server/positions/service';
import { actorForJob } from '@/worker/job-actor';
import type { JobContext } from '@/worker/registry';
import { analyzeEntry, type MatchRunner } from './analyze';

/** How many analyses of one batch run at the same time. Each is a long model call. */
export const BATCH_CONCURRENCY = 3;

/**
 * Checks a batch request up front (US-302): every candidate must be in this position and the person
 * must be allowed to analyze each, otherwise the whole request is refused and nothing starts.
 */
export async function validateBatch(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  entryIds: string[],
): Promise<void> {
  await requirePosition(tx, actor, positionId, 'read');
  for (const entryId of entryIds) {
    const entry = await requireEntry(tx, actor, entryId, 'edit');
    if (entry.positionId !== positionId) {
      throw new ApiError('invalid_input', 'A candidate in the list is not in this position', {
        status: 422,
        fields: { entryIds: 'A candidate is not in this position' },
      });
    }
  }
}

/** Queues the batch. Every request is its own run: analyzing again is a new decision by the recruiter. */
export async function startBatchAnalysis(
  actor: AgencyActor,
  positionId: string,
  input: BatchAnalysisInput,
): Promise<{ jobRunId: string; total: number }> {
  await withAgency(actor.agencyId, (tx) => validateBatch(tx, actor, positionId, input.entryIds), {
    userId: actor.userId,
  });
  const { jobRunId } = await enqueue({
    queue: 'ai',
    name: 'match.batch',
    agencyId: actor.agencyId,
    requestedById: actor.userId,
    data: { positionId, entryIds: input.entryIds },
    idempotencyKey: `match.batch:${crypto.randomUUID()}`,
  });
  return { jobRunId, total: input.entryIds.length };
}

const dataSchema = z.object({ positionId: z.guid(), entryIds: z.array(z.guid()).min(1) });

/**
 * Worker job `ai:match.batch` (T-3-05): analyzes each candidate, a few at a time, and reports the
 * state of every candidate after every step so the page can show progress. One candidate failing
 * (for example an unconfirmed profile) does not stop the others. Running out of AI budget does:
 * the rest are skipped and the job ends normally, with the reason on each.
 */
export async function runBatchJob(ctx: JobContext, run: MatchRunner): Promise<BatchProgress> {
  const { entryIds } = dataSchema.parse(ctx.data);
  const actor = await actorForJob(ctx);
  const progress: BatchProgress = {
    total: entryIds.length,
    completed: 0,
    failed: 0,
    skipped: 0,
    entries: Object.fromEntries(entryIds.map((id) => [id, { status: 'pending' as const }])),
  };
  const report = () => ctx.progress({ ...progress, entries: { ...progress.entries } });
  await report();

  let budgetUsed = false;
  const queue = [...entryIds];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      if (budgetUsed) {
        progress.entries[id] = { status: 'skipped', reason: 'budget_exceeded' };
        progress.skipped++;
        await report();
        continue;
      }
      progress.entries[id] = { status: 'running' };
      await report();
      try {
        const result = await analyzeEntry({ run, withAgency: ctx.withAgency }, actor, id);
        progress.entries[id] = { status: 'done', analysisId: result.id };
        progress.completed++;
      } catch (error) {
        if (error instanceof UnrecoverableError) throw error;
        const code = error instanceof ApiError ? error.code : 'failed';
        if (error instanceof ApiError && error.status === 402) {
          budgetUsed = true;
          progress.entries[id] = { status: 'skipped', reason: 'budget_exceeded' };
          progress.skipped++;
        } else {
          progress.entries[id] = { status: 'failed', reason: code };
          progress.failed++;
        }
      }
      await report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, entryIds.length) }, worker));
  return progress;
}
