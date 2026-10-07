// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Redis } from 'ioredis';
import type { RateLimitStore } from '../http/rate-limit';

const HIT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}`;

/** Fixed-window counters in Redis, shared by every web process (use via `setRateLimitStore`). */
export function createRedisRateLimitStore(redis: Redis, prefix = 'em:rl'): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const [count, ttl] = (await redis.eval(HIT, 1, `${prefix}:${key}`, windowMs)) as [
        number,
        number,
      ];
      return { count, resetAt: Date.now() + Math.max(ttl, 0) };
    },
  };
}
