// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ApiError } from './errors';
import { errorResponse } from './responses';

/** Counts hits per key in fixed windows. The Redis store (queue layer) replaces the memory one in production. */
export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

export function createMemoryStore(now: () => number = Date.now): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowMs) {
      const t = now();
      const current = windows.get(key);
      if (!current || current.resetAt <= t) {
        const fresh = { count: 1, resetAt: t + windowMs };
        windows.set(key, fresh);
        return fresh;
      }
      current.count += 1;
      return current;
    },
  };
}

let store: RateLimitStore = createMemoryStore();

/** Swap the store (tests, or Redis once connected). */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

export interface RateLimitOptions {
  /** Identifies what is limited, e.g. `magic-link:ip`. */
  name: string;
  limit: number;
  windowSec: number;
}

/** Best-effort client IP behind a proxy; falls back to a shared bucket (never to "no limit"). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Returns a 429 `Response` when `subject` has exceeded the limit, else null:
 * `const limited = await rateLimit(req, { name: 'x', limit: 10, windowSec: 60 }); if (limited) return limited;`
 * `subject` defaults to the client IP; pass an email or user id for per-identity limits.
 */
export async function rateLimit(
  req: Request,
  options: RateLimitOptions,
  subject: string = clientIp(req),
): Promise<Response | null> {
  const { count, resetAt } = await store.hit(
    `${options.name}:${subject}`,
    options.windowSec * 1000,
  );
  if (count <= options.limit) return null;
  const response = errorResponse(
    new ApiError('rate_limited', 'Too many requests, try again later'),
  );
  response.headers.set(
    'Retry-After',
    String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
  );
  return response;
}
