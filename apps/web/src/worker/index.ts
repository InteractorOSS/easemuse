// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Worker entry point: `pnpm --filter @easemuse/web worker` (PROCESS_ROLE=worker).
import { Worker } from 'bullmq';
import {
  checkRuntimeRoleOnBoot,
  closeDb,
  getAgencyByRef,
  updateJobRun,
  withAgency,
} from '@/lib/db';
import { getEnv } from '@/lib/env';
import { createAgencyLimiter } from '@/lib/queue/agency-limiter';
import { QUEUE_NAMES, type QueueName } from '@/lib/queue/names';
import { closeQueues, getQueueConnection, QUEUE_PREFIX } from '@/lib/queue/queues';
import { createRedis } from '@/lib/redis';
import { publishDetached } from '@/lib/realtime/publish';
import { channels } from '@/lib/realtime/channels';
import { enqueue } from '@/lib/queue/enqueue';
import { createProcessor } from './dispatcher';
import { registerHandlers } from './handlers';
import { startPgListen } from './pg-listen';
import { registry } from './registry';
import { startScheduler } from './scheduler';

/** Jobs run at once per queue in this process. */
const CONCURRENCY: Record<QueueName, number> = {
  ai: 4,
  documents: 2,
  messaging: 5,
  indexing: 4,
  maintenance: 1,
};

/** Fairness cap: concurrent `ai` jobs per agency across all workers (ADR-013). */
const AI_JOBS_PER_AGENCY = 3;

async function main(): Promise<void> {
  process.env.PROCESS_ROLE ??= 'worker';
  const env = getEnv();
  await checkRuntimeRoleOnBoot();

  registerHandlers(registry);
  const connection = getQueueConnection();
  const limiter = createAgencyLimiter({
    redis: connection,
    prefix: 'em:limit:ai',
    maxConcurrent: AI_JOBS_PER_AGENCY,
  });
  const log = (message: string, data: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ at: new Date().toISOString(), message, ...data }));

  const workers = QUEUE_NAMES.map(
    (queue) =>
      new Worker(
        queue,
        createProcessor(queue, {
          registry,
          updateJobRun,
          getAgency: getAgencyByRef,
          withAgency,
          publishJobEvent: (jobRunId, type, ids) =>
            publishDetached(channels.job(jobRunId), type, ids),
          limiter,
          limitedQueues: ['ai'],
          log,
        }),
        { connection, prefix: QUEUE_PREFIX, concurrency: CONCURRENCY[queue] },
      ),
  );
  for (const worker of workers) {
    worker.on('error', (error) =>
      log('worker.error', { queue: worker.name, error: error.message }),
    );
  }

  const listenRedis = createRedis(env.REDIS_URL);
  const listener = startPgListen({
    connectionString: env.DATABASE_URL,
    redis: listenRedis,
    log: (message, data) => log(message, data ?? {}),
  });

  const stopScheduler = startScheduler({ enqueue, log });

  log('worker.started', { queues: [...QUEUE_NAMES] });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('worker.stopping', { signal });
    stopScheduler();
    await Promise.all(workers.map((w) => w.close()));
    await listener.stop();
    await listenRedis.quit().catch(() => undefined);
    await closeQueues();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[worker] failed to start', error);
  process.exit(1);
});
