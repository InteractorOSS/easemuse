// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import type { AgencyRef, JobStatus, ScopedTx } from '@/lib/db';
import type { AgencyLimiter } from '@/lib/queue/agency-limiter';
import { jobPayloadSchema, SYSTEM_QUEUES, type QueueName } from '@/lib/queue/names';
import type { JobContext, JobRegistry } from './registry';

export interface DispatcherDeps {
  registry: JobRegistry;
  updateJobRun(
    id: string,
    patch: { status?: JobStatus; progress?: unknown; error?: string | null },
  ): Promise<void>;
  getAgency(id: string): Promise<AgencyRef | null>;
  withAgency<T>(agencyId: string, fn: (tx: ScopedTx) => Promise<T>): Promise<T>;
  /** Publishes `job:<id>` events (ids and status only). */
  publishJobEvent(jobRunId: string, type: string, ids: Record<string, unknown>): Promise<void>;
  /** Per-agency concurrency cap, applied to queues named in `limitedQueues`. */
  limiter?: AgencyLimiter;
  limitedQueues?: readonly QueueName[];
  /** How long a job waits when its agency is at its concurrency cap. */
  limitDelayMs?: number;
  log?(message: string, data: Record<string, unknown>): void;
}

/** The numbers, strings and flags of a progress report; nested objects and lists stay in the JobRun. */
export function scalarsOf(
  progress: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    Object.entries(progress).filter(
      ([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v),
    ),
  ) as Record<string, string | number | boolean | null>;
}

/**
 * Builds the BullMQ processor for one queue. It validates the payload, refuses unknown jobs and
 * suspended agencies, applies the per-agency cap, keeps JobRun status in step, and hands the
 * handler an agency-bound context.
 */
export function createProcessor(queue: QueueName, deps: DispatcherDeps) {
  const log = deps.log ?? (() => undefined);
  const limited = deps.limitedQueues?.includes(queue) ?? false;

  async function fail(jobRunId: string, reason: string): Promise<never> {
    await deps.updateJobRun(jobRunId, { status: 'failed', error: reason });
    await deps.publishJobEvent(jobRunId, 'job.failed', { jobRunId, reason });
    throw new UnrecoverableError(reason);
  }

  return async function process(job: Job, token?: string): Promise<void> {
    const parsed = jobPayloadSchema.safeParse(job.data);
    if (!parsed.success) throw new UnrecoverableError('invalid_job_payload');
    const payload = parsed.data;
    const { jobRunId, agencyId } = payload;

    const handler = deps.registry.get(queue, job.name);
    if (!handler) return fail(jobRunId, `unknown_job:${queue}:${job.name}`);
    if (agencyId === null && !SYSTEM_QUEUES.includes(queue))
      return fail(jobRunId, 'missing_agency');

    if (agencyId !== null) {
      const agency = await deps.getAgency(agencyId);
      if (!agency) return fail(jobRunId, 'agency_not_found');
      if (agency.status === 'suspended' || agency.status === 'closed')
        return fail(jobRunId, 'agency_suspended');
    }

    let acquired = false;
    if (limited && agencyId !== null && deps.limiter) {
      acquired = await deps.limiter.acquire(agencyId);
      if (!acquired) {
        // At the agency's cap: put the job back for a moment instead of occupying a worker slot.
        await job.moveToDelayed(Date.now() + (deps.limitDelayMs ?? 2_000), token);
        throw new DelayedError();
      }
    }

    const ctx: JobContext = {
      jobRunId,
      agencyId,
      requestedById: payload.requestedById,
      data: payload.data,
      attempt: job.attemptsMade + 1,
      withAgency(fn) {
        if (agencyId === null) throw new Error('This job has no agency context');
        return deps.withAgency(agencyId, fn);
      },
      async progress(progress) {
        await deps.updateJobRun(jobRunId, { progress });
        // Events carry ids and counts only (they travel in a size-limited notification); the full progress is in the JobRun.
        await deps.publishJobEvent(jobRunId, 'job.progress', { jobRunId, ...scalarsOf(progress) });
      },
    };

    try {
      await deps.updateJobRun(jobRunId, { status: 'running', error: null });
      await deps.publishJobEvent(jobRunId, 'job.running', { jobRunId });
      await handler(ctx);
      await deps.updateJobRun(jobRunId, { status: 'succeeded' });
      await deps.publishJobEvent(jobRunId, 'job.succeeded', { jobRunId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = error instanceof UnrecoverableError || isPermanentFailure(error);
      const willRetry = !permanent && job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      log('job.error', { queue, name: job.name, jobRunId, willRetry, message });
      await deps.updateJobRun(jobRunId, {
        status: willRetry ? 'queued' : 'failed',
        error: message.slice(0, 500),
      });
      await deps.publishJobEvent(jobRunId, willRetry ? 'job.retrying' : 'job.failed', { jobRunId });
      // BullMQ retries anything that is not an UnrecoverableError.
      throw permanent && !(error instanceof UnrecoverableError)
        ? new UnrecoverableError(message)
        : error;
    } finally {
      if (acquired && agencyId !== null) await deps.limiter!.release(agencyId);
    }
  };
}

/**
 * Failures that a retry cannot fix, for example the AI account has no credit or its key was rejected
 * (`ai_account_*`): the job stops at once instead of retrying.
 */
export function isPermanentFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('ai_account_');
}
