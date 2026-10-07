// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryStore, rateLimit, setRateLimitStore } from './rate-limit';

const req = (ip = '1.2.3.4') =>
  new Request('http://x.test', { headers: { 'x-forwarded-for': ip } });
const opts = { name: 't', limit: 2, windowSec: 60 };

afterEach(() => setRateLimitStore(createMemoryStore()));

describe('rateLimit', () => {
  it('allows up to the limit then answers 429 with Retry-After', async () => {
    expect(await rateLimit(req(), opts)).toBeNull();
    expect(await rateLimit(req(), opts)).toBeNull();
    const limited = await rateLimit(req(), opts);
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await limited!.json()).error.code).toBe('rate_limited');
  });

  it('limits each client and each subject separately', async () => {
    await rateLimit(req('1.1.1.1'), opts);
    await rateLimit(req('1.1.1.1'), opts);
    expect((await rateLimit(req('1.1.1.1'), opts))?.status).toBe(429);
    expect(await rateLimit(req('2.2.2.2'), opts)).toBeNull();
    expect(await rateLimit(req('1.1.1.1'), opts, 'a@b.test')).toBeNull();
  });

  it('starts a new window after it expires', async () => {
    let t = 0;
    setRateLimitStore(createMemoryStore(() => t));
    await rateLimit(req(), opts);
    await rateLimit(req(), opts);
    expect((await rateLimit(req(), opts))?.status).toBe(429);
    t = 61_000;
    expect(await rateLimit(req(), opts)).toBeNull();
  });
});
