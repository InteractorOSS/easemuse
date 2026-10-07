// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { Redis, type RedisOptions } from 'ioredis';
import { getEnv } from './env';

/**
 * Creates an ioredis client with an `error` listener attached. Without one, Node re-throws a bare
 * connection error as an uncaught exception and takes the process down; the client reconnects on
 * its own, so logging is enough.
 */
export function createRedis(url: string = getEnv().REDIS_URL, options: RedisOptions = {}): Redis {
  const client = new Redis(url, options);
  client.on('error', (error) => console.error('[redis]', error.message));
  return client;
}
