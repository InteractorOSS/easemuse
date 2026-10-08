// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createProcessor, isPermanentFailure, type DispatcherDeps } from './dispatcher';
import { JobRegistry, type JobHandler } from './registry';

const agencyId = randomUUID();
const jobRunId = randomUUID();

function fakeJob(overrides: Partial<Job> & { data?: unknown } = {}): Job {
  return {
    name: 'do.thing',
    data: { jobRunId, agencyId, requestedById: null, data: { n: 1 } },
    attemptsMade: 0,
    opts: { attempts: 3 },
    moveToDelayed: vi.fn(),
    ...overrides,
  } as unknown as Job;
}

function setup(
  handler: JobHandler = vi.fn(async () => undefined),
  deps: Partial<DispatcherDeps> = {},
  queue: 'ai' | 'maintenance' | 'documents' = 'documents',
) {
  const registry = new JobRegistry().register(queue, 'do.thing', handler);
  const base: DispatcherDeps = {
    registry,
    updateJobRun: vi.fn(async () => undefined),
    getAgency: vi.fn(async () => ({
      id: agencyId,
      slug: 's',
      name: 'A',
      status: 'active' as const,
    })),
    withAgency: vi.fn(async (_id, fn) => fn({} as never)),
    publishJobEvent: vi.fn(async () => undefined),
    ...deps,
  };
  return { deps: base, process: createProcessor(queue, base), handler };
}

describe('job dispatcher', () => {
  it('runs the handler with an agency-bound context and records status', async () => {
    const { deps, process, handler } = setup();
    await process(fakeJob());
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ jobRunId, agencyId, data: { n: 1 }, attempt: 1 }),
    );
    expect(deps.updateJobRun).toHaveBeenNthCalledWith(1, jobRunId, {
      status: 'running',
      error: null,
    });
    expect(deps.updateJobRun).toHaveBeenLastCalledWith(jobRunId, { status: 'succeeded' });
    expect(deps.publishJobEvent).toHaveBeenLastCalledWith(jobRunId, 'job.succeeded', { jobRunId });
  });

  it('binds withAgency to the job agency and publishes progress', async () => {
    const handler = vi.fn(async (ctx) => {
      await ctx.withAgency(async () => 1);
      await ctx.progress({ done: 2 });
    });
    const { deps, process } = setup(handler);
    await process(fakeJob());
    expect(deps.withAgency).toHaveBeenCalledWith(agencyId, expect.any(Function));
    expect(deps.updateJobRun).toHaveBeenCalledWith(jobRunId, { progress: { done: 2 } });
    expect(deps.publishJobEvent).toHaveBeenCalledWith(jobRunId, 'job.progress', {
      jobRunId,
      done: 2,
    });
  });

  it('publishes only the numbers and flags of a progress report, keeping nested detail in the JobRun', async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        `entry-${i}`,
        { status: 'done', analysisId: 'a'.repeat(36) },
      ]),
    );
    const handler = vi.fn(async (ctx) => {
      await ctx.progress({
        total: 50,
        completed: 3,
        label: 'working',
        paused: false,
        nothing: null,
        entries,
        list: [1, 2],
      });
    });
    const { deps, process } = setup(handler);
    await process(fakeJob());
    expect(deps.updateJobRun).toHaveBeenCalledWith(jobRunId, {
      progress: expect.objectContaining({ entries }),
    });
    expect(deps.publishJobEvent).toHaveBeenCalledWith(jobRunId, 'job.progress', {
      jobRunId,
      total: 50,
      completed: 3,
      label: 'working',
      paused: false,
      nothing: null,
    });
  });

  it('fails permanently on a bad payload, unknown job, missing agency or suspended agency', async () => {
    const { process } = setup();
    await expect(process(fakeJob({ data: { nope: true } }))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    await expect(process(fakeJob({ name: 'unknown' }))).rejects.toThrow(/unknown_job/);

    const noAgency = setup();
    await expect(
      noAgency.process(
        fakeJob({ data: { jobRunId, agencyId: null, requestedById: null, data: null } }),
      ),
    ).rejects.toThrow(/missing_agency/);

    const suspended = setup(undefined, {
      getAgency: async () => ({ id: agencyId, slug: 's', name: 'A', status: 'suspended' }),
    });
    await expect(suspended.process(fakeJob())).rejects.toThrow(/agency_suspended/);
    expect(suspended.handler).not.toHaveBeenCalled();
    expect(suspended.deps.updateJobRun).toHaveBeenCalledWith(jobRunId, {
      status: 'failed',
      error: 'agency_suspended',
    });
  });

  it('allows an agency-less job on a system queue, but withAgency then throws', async () => {
    let caught: unknown;
    const handler = vi.fn(async (ctx) => {
      try {
        await ctx.withAgency(async () => 1);
      } catch (error) {
        caught = error;
      }
    });
    const { process } = setup(handler, {}, 'maintenance');
    await process(fakeJob({ data: { jobRunId, agencyId: null, requestedById: null, data: null } }));
    expect((caught as Error).message).toMatch(/no agency/);
  });

  it('marks the run queued when a retry remains and failed on the last attempt', async () => {
    const boom = vi.fn(async () => {
      throw new Error('boom');
    });
    const first = setup(boom);
    await expect(first.process(fakeJob({ attemptsMade: 0 }))).rejects.toThrow('boom');
    expect(first.deps.updateJobRun).toHaveBeenLastCalledWith(jobRunId, {
      status: 'queued',
      error: 'boom',
    });

    const last = setup(boom);
    await expect(last.process(fakeJob({ attemptsMade: 2 }))).rejects.toThrow('boom');
    expect(last.deps.updateJobRun).toHaveBeenLastCalledWith(jobRunId, {
      status: 'failed',
      error: 'boom',
    });
    expect(last.deps.publishJobEvent).toHaveBeenLastCalledWith(jobRunId, 'job.failed', {
      jobRunId,
    });
  });

  it('stops at once, without retrying, when the AI account has no credit or a rejected key', async () => {
    const accountProblem = Object.assign(new Error('AI drafting is paused: no credit'), {
      code: 'ai_account_no_credit',
    });
    const run = setup(
      vi.fn(async () => {
        throw accountProblem;
      }),
    );
    const error = await run.process(fakeJob({ attemptsMade: 0 })).catch((e) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(run.deps.updateJobRun).toHaveBeenLastCalledWith(jobRunId, {
      status: 'failed',
      error: 'AI drafting is paused: no credit',
    });
    expect(run.deps.publishJobEvent).toHaveBeenLastCalledWith(jobRunId, 'job.failed', { jobRunId });
    expect(isPermanentFailure(accountProblem)).toBe(true);
    expect(isPermanentFailure(Object.assign(new Error('x'), { code: 'ai_unavailable' }))).toBe(
      false,
    );
    expect(isPermanentFailure(null)).toBe(false);
  });

  describe('per-agency cap on limited queues', () => {
    it('delays the job when the agency is at its cap, without running it', async () => {
      const limiter = { acquire: vi.fn(async () => false), release: vi.fn(async () => undefined) };
      const { process, handler } = setup(
        undefined,
        { limiter, limitedQueues: ['ai'], limitDelayMs: 10 },
        'ai',
      );
      const job = fakeJob();
      await expect(process(job, 'tok')).rejects.toBeInstanceOf(DelayedError);
      expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok');
      expect(handler).not.toHaveBeenCalled();
      expect(limiter.release).not.toHaveBeenCalled();
    });

    it('releases the slot after success and after failure', async () => {
      const limiter = { acquire: vi.fn(async () => true), release: vi.fn(async () => undefined) };
      const ok = setup(undefined, { limiter, limitedQueues: ['ai'] }, 'ai');
      await ok.process(fakeJob());
      const bad = setup(
        async () => {
          throw new Error('x');
        },
        { limiter, limitedQueues: ['ai'] },
        'ai',
      );
      await expect(bad.process(fakeJob())).rejects.toThrow();
      expect(limiter.release).toHaveBeenCalledTimes(2);
      expect(limiter.release).toHaveBeenCalledWith(agencyId);
    });

    it('does not apply the cap to other queues', async () => {
      const limiter = { acquire: vi.fn(async () => false), release: vi.fn(async () => undefined) };
      const { process, handler } = setup(
        undefined,
        { limiter, limitedQueues: ['ai'] },
        'documents',
      );
      await process(fakeJob());
      expect(handler).toHaveBeenCalled();
      expect(limiter.acquire).not.toHaveBeenCalled();
    });
  });
});
