// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createJobRunIfAbsent, updateJobRun } from '../db/job-runs';
import { QUEUE_NAMES, SYSTEM_QUEUES, type JobPayload, type QueueName } from './names';
import { getQueue, type QueueOptions } from './queues';

export interface EnqueueInput {
  queue: QueueName;
  /** Job name; the worker dispatches on (queue, name). */
  name: string;
  /** The agency whose context the job runs in; null only on system queues. */
  agencyId: string | null;
  /** The human who asked for it (brief §1.1: AI runs only on request). */
  requestedById: string | null;
  data?: unknown;
  /** Same key on the same queue returns the existing JobRun instead of adding a second job. */
  idempotencyKey: string;
  /** Retry policy override (default: 3 attempts, 5 s exponential backoff). */
  attempts?: number;
  backoffMs?: number;
}

export interface EnqueueResult {
  jobRunId: string;
  /** True when an earlier enqueue with the same key already exists. */
  deduplicated: boolean;
}

/**
 * Writes the `JobRun` row, then adds the BullMQ job with the JobRun id as its job id, so progress
 * and status are addressable as `job:<id>` (architecture §5.7). If adding to Redis fails the
 * JobRun is marked failed and the error is re-thrown, so no orphan "queued" row is left behind.
 */
export async function enqueue(
  input: EnqueueInput,
  options: QueueOptions = {},
): Promise<EnqueueResult> {
  if (!QUEUE_NAMES.includes(input.queue)) throw new Error(`Unknown queue: ${input.queue}`);
  if (input.agencyId === null && !SYSTEM_QUEUES.includes(input.queue)) {
    throw new Error(`Queue "${input.queue}" requires an agencyId`);
  }

  const { jobRun, created } = await createJobRunIfAbsent({
    queue: input.queue,
    name: input.name,
    idempotencyKey: input.idempotencyKey,
    agencyId: input.agencyId,
    requestedById: input.requestedById,
  });
  if (!created) return { jobRunId: jobRun.id, deduplicated: true };

  const payload: JobPayload = {
    jobRunId: jobRun.id,
    agencyId: input.agencyId,
    requestedById: input.requestedById,
    data: input.data ?? null,
  };
  try {
    await getQueue(input.queue, options).add(input.name, payload, {
      jobId: jobRun.id,
      ...(input.attempts ? { attempts: input.attempts } : {}),
      ...(input.backoffMs ? { backoff: { type: 'exponential', delay: input.backoffMs } } : {}),
    });
  } catch (error) {
    await updateJobRun(jobRun.id, { status: 'failed', error: 'enqueue_failed' });
    throw error;
  }
  return { jobRunId: jobRun.id, deduplicated: false };
}
