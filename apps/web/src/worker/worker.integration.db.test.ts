// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { UnrecoverableError, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getAgencyByRef, getJobRun, updateJobRun, withAgency } from '@/lib/db';
import { createAgencyLimiter } from '@/lib/queue/agency-limiter';
import { enqueue } from '@/lib/queue/enqueue';
import type { QueueName } from '@/lib/queue/names';
import { closeQueues, getQueue } from '@/lib/queue/queues';
import { createRedis } from '@/lib/redis';
import { adminClient, cleanup, createAgency, dbAvailable, redisAvailable } from '@/test/db';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from '@/test/db-env';
import { createProcessor } from './dispatcher';
import { JobRegistry } from './registry';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!dbAvailable() || !redisAvailable())(
  'queue + worker (real Postgres and Redis)',
  () => {
    const prefix = `emtest-${randomUUID().slice(0, 8)}`;
    const options = { prefix };
    let admin: pg.Client;
    let redis: Redis;
    let workerRedis: Redis;
    let workers: Worker[] = [];
    let agencyA: string;
    let agencyB: string;
    const registry = new JobRegistry();
    const running = new Map<string, number>();
    let maxConcurrentA = 0;
    let overlapAB = false;
    let handled = 0;

    async function waitForStatus(id: string, status: string, timeoutMs = 8_000) {
      const start = Date.now();
      for (;;) {
        const job = await getJobRun(id);
        if (job?.status === status) return job;
        if (Date.now() - start > timeoutMs)
          throw new Error(`job ${id} is ${job?.status}, wanted ${status}`);
        await sleep(25);
      }
    }

    beforeAll(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL;
      process.env.REDIS_URL = TEST_REDIS_URL;
      admin = await adminClient();
      redis = createRedis(TEST_REDIS_URL, { maxRetriesPerRequest: null });
      workerRedis = createRedis(TEST_REDIS_URL, { maxRetriesPerRequest: null });
      agencyA = await createAgency(admin, 'A');
      agencyB = await createAgency(admin, 'B');

      registry
        .register('documents', 'write.client', async (ctx) => {
          handled += 1;
          await ctx.withAgency((tx) =>
            tx.client.create({ data: { agencyId: ctx.agencyId!, name: 'from job' } }),
          );
          await ctx.progress({ step: 'written' });
        })
        .register('documents', 'fatal', async () => {
          throw new UnrecoverableError('nope');
        })
        .register('ai', 'slow', async (ctx) => {
          const id = ctx.agencyId!;
          running.set(id, (running.get(id) ?? 0) + 1);
          if (id === agencyA) maxConcurrentA = Math.max(maxConcurrentA, running.get(id)!);
          if (id === agencyB && (running.get(agencyA) ?? 0) > 0) overlapAB = true;
          if (id === agencyA && (running.get(agencyB) ?? 0) > 0) overlapAB = true;
          await sleep(200);
          running.set(id, running.get(id)! - 1);
        });

      const limiter = createAgencyLimiter({ redis, prefix: `${prefix}:limit`, maxConcurrent: 1 });
      const deps = (queue: QueueName) =>
        createProcessor(queue, {
          registry,
          updateJobRun,
          getAgency: getAgencyByRef,
          withAgency,
          publishJobEvent: async () => undefined,
          limiter,
          limitedQueues: ['ai'],
          limitDelayMs: 50,
        });
      workers = [
        new Worker('documents', deps('documents'), {
          connection: workerRedis,
          prefix,
          concurrency: 2,
        }),
        new Worker('ai', deps('ai'), { connection: workerRedis, prefix, concurrency: 4 }),
      ];
    });

    afterAll(async () => {
      await Promise.all(workers.map((w) => w.close()));
      for (const name of ['documents', 'ai'] as const)
        await getQueue(name, options)
          .obliterate({ force: true })
          .catch(() => undefined);
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys);
      await closeQueues();
      await redis.quit();
      await workerRedis.quit();
      await cleanup(admin, { agencies: [agencyA, agencyB] });
      await admin.query(`DELETE FROM "JobRun" WHERE "agencyId" = ANY($1::uuid[])`, [
        [agencyA, agencyB],
      ]);
      await admin.end();
      await closeDb();
    });

    const documentsJob = (agencyId: string | null, name: string, key: string) =>
      enqueue(
        { queue: 'documents', name, agencyId, requestedById: null, idempotencyKey: key },
        options,
      );

    it('runs a job in the agency context, records progress and marks it succeeded', async () => {
      const { jobRunId } = await documentsJob(agencyA, 'write.client', `k-${randomUUID()}`);
      const job = await waitForStatus(jobRunId, 'succeeded');
      expect(job.progress).toMatchObject({ step: 'written' });
      const rows = await admin.query(`SELECT name FROM "Client" WHERE "agencyId" = $1`, [agencyA]);
      expect(rows.rows).toContainEqual({ name: 'from job' });
    });

    it('does not run a job twice for the same idempotency key', async () => {
      const key = `k-${randomUUID()}`;
      const before = handled;
      const first = await documentsJob(agencyA, 'write.client', key);
      const second = await documentsJob(agencyA, 'write.client', key);
      expect(second).toEqual({ jobRunId: first.jobRunId, deduplicated: true });
      await waitForStatus(first.jobRunId, 'succeeded');
      await sleep(150);
      expect(handled - before).toBe(1);
    });

    it('fails an unrecoverable job without retrying', async () => {
      const { jobRunId } = await documentsJob(agencyA, 'fatal', `k-${randomUUID()}`);
      const job = await waitForStatus(jobRunId, 'failed');
      expect(job.error).toBe('nope');
    });

    it('fails a job for a suspended agency without running it', async () => {
      const suspended = await createAgency(admin, 'S');
      await admin.query(`UPDATE "Agency" SET status = 'suspended' WHERE id = $1`, [suspended]);
      try {
        const before = handled;
        const { jobRunId } = await documentsJob(suspended, 'write.client', `k-${randomUUID()}`);
        const job = await waitForStatus(jobRunId, 'failed');
        expect(job.error).toBe('agency_suspended');
        expect(handled).toBe(before);
      } finally {
        await admin.query(`DELETE FROM "JobRun" WHERE "agencyId" = $1`, [suspended]);
        await cleanup(admin, { agencies: [suspended] });
      }
    });

    it('refuses an agency-less job on an agency queue', async () => {
      await expect(documentsJob(null, 'write.client', `k-${randomUUID()}`)).rejects.toThrow(
        /requires an agencyId/,
      );
    });

    it('caps concurrent ai jobs per agency without blocking other agencies', async () => {
      const ids = await Promise.all([
        ...[1, 2, 3].map((n) =>
          enqueue(
            {
              queue: 'ai',
              name: 'slow',
              agencyId: agencyA,
              requestedById: null,
              idempotencyKey: `a${n}-${randomUUID()}`,
            },
            options,
          ),
        ),
        enqueue(
          {
            queue: 'ai',
            name: 'slow',
            agencyId: agencyB,
            requestedById: null,
            idempotencyKey: `b-${randomUUID()}`,
          },
          options,
        ),
      ]);
      await Promise.all(ids.map((r) => waitForStatus(r.jobRunId, 'succeeded', 15_000)));
      expect(maxConcurrentA).toBe(1);
      expect(overlapAB).toBe(true);
    });
  },
);
