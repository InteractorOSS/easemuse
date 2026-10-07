// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRedis } from '@/lib/redis';
import { redisAvailable } from '@/test/db';
import { TEST_REDIS_URL } from '@/test/db-env';
import { createAgencyLimiter } from './agency-limiter';
import { createRedisRateLimitStore } from './redis-rate-limit-store';

describe.skipIf(!redisAvailable())('Redis limiter and rate-limit store', () => {
  const prefix = `emtest-${randomUUID().slice(0, 8)}`;
  let redis: Redis;

  beforeAll(() => {
    redis = createRedis(TEST_REDIS_URL);
  });
  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  it('agency limiter grants up to the cap, refuses beyond it and frees slots on release', async () => {
    const limiter = createAgencyLimiter({ redis, prefix: `${prefix}:l`, maxConcurrent: 2 });
    expect(await limiter.acquire('a')).toBe(true);
    expect(await limiter.acquire('a')).toBe(true);
    expect(await limiter.acquire('a')).toBe(false);
    expect(await limiter.acquire('b')).toBe(true);
    await limiter.release('a');
    expect(await limiter.acquire('a')).toBe(true);
  });

  it('release never drives the counter negative', async () => {
    const limiter = createAgencyLimiter({ redis, prefix: `${prefix}:n`, maxConcurrent: 1 });
    await limiter.release('x');
    await limiter.release('x');
    expect(await limiter.acquire('x')).toBe(true);
    expect(await limiter.acquire('x')).toBe(false);
  });

  it('counts atomically under concurrency', async () => {
    const limiter = createAgencyLimiter({ redis, prefix: `${prefix}:c`, maxConcurrent: 5 });
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.acquire('a')));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('rate-limit store counts hits per key within a window', async () => {
    const store = createRedisRateLimitStore(redis, `${prefix}:rl`);
    const first = await store.hit('k', 60_000);
    const second = await store.hit('k', 60_000);
    expect([first.count, second.count]).toEqual([1, 2]);
    expect(second.resetAt).toBeGreaterThan(Date.now());
    expect((await store.hit('other', 60_000)).count).toBe(1);
  });
});
