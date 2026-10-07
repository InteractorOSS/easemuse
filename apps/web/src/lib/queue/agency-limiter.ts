// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Redis } from 'ioredis';

/**
 * Caps how many jobs of one queue run at once for one agency (ADR-013, NFR-SC03), so a batch from
 * one agency cannot starve the others. BullMQ's per-group limiter is a Pro feature, so this is a
 * Redis counter: acquire before running, release after. Counters expire (`ttlSec`) so a crashed
 * worker cannot hold a slot forever.
 */
const ACQUIRE = `
local c = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
if c > tonumber(ARGV[1]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1`;

const RELEASE = `
local c = redis.call('DECR', KEYS[1])
if c < 0 then redis.call('SET', KEYS[1], 0, 'EX', ARGV[1]) end
return c`;

export interface AgencyLimiter {
  acquire(agencyId: string): Promise<boolean>;
  release(agencyId: string): Promise<void>;
}

export interface AgencyLimiterOptions {
  redis: Redis;
  /** Key namespace, e.g. `em:limit:ai`. */
  prefix: string;
  maxConcurrent: number;
  ttlSec?: number;
}

export function createAgencyLimiter(options: AgencyLimiterOptions): AgencyLimiter {
  const ttl = options.ttlSec ?? 15 * 60;
  const key = (agencyId: string) => `${options.prefix}:${agencyId}`;
  return {
    async acquire(agencyId) {
      const result = await options.redis.eval(
        ACQUIRE,
        1,
        key(agencyId),
        options.maxConcurrent,
        ttl,
      );
      return result === 1;
    },
    async release(agencyId) {
      await options.redis.eval(RELEASE, 1, key(agencyId), ttl);
    },
  };
}
