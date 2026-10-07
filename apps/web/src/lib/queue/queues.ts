// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { createRedis } from '../redis';
import type { QueueName } from './names';

/** BullMQ key prefix: this Redis may be shared with other apps, so never use the bare default. */
export const QUEUE_PREFIX = 'easemuse';

/** Default job options: bounded retries with backoff, history trimmed (JobRun keeps the record). */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
} as const;

const globalForQueues = globalThis as unknown as {
  easemuseQueueConnection?: Redis;
  easemuseQueues?: Map<string, Queue>;
};

/** One shared connection per process; BullMQ needs `maxRetriesPerRequest: null`. */
export function getQueueConnection(): Redis {
  globalForQueues.easemuseQueueConnection ??= createRedis(undefined, {
    maxRetriesPerRequest: null,
  });
  return globalForQueues.easemuseQueueConnection;
}

export interface QueueOptions {
  prefix?: string;
  connection?: Redis;
}

export function getQueue(name: QueueName, options: QueueOptions = {}): Queue {
  const queues = (globalForQueues.easemuseQueues ??= new Map());
  const prefix = options.prefix ?? QUEUE_PREFIX;
  const key = `${prefix}:${name}`;
  let queue = queues.get(key);
  if (!queue) {
    queue = new Queue(name, {
      connection: options.connection ?? getQueueConnection(),
      prefix,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(key, queue);
  }
  return queue;
}

/** Test/shutdown helper: closes every queue and the shared connection. */
export async function closeQueues(): Promise<void> {
  const queues = globalForQueues.easemuseQueues;
  if (queues) await Promise.all([...queues.values()].map((q) => q.close()));
  queues?.clear();
  const connection = globalForQueues.easemuseQueueConnection;
  globalForQueues.easemuseQueueConnection = undefined;
  await connection?.quit().catch(() => undefined);
}
