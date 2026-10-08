// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { signPortalSession, verifyPortalSession } from './session';

const secret = 'portal-test-secret-0123456789abcdef';
const who = {
  portalUserId: '11111111-1111-4111-8111-111111111111',
  agencyId: '22222222-2222-4222-8222-222222222222',
  audience: 'hiring_manager' as const,
};
const T0 = Date.UTC(2026, 9, 7, 9);

describe('portal session cookie', () => {
  it('round-trips who the person is and for which agency', () => {
    expect(
      verifyPortalSession(secret, signPortalSession(secret, who, T0), T0 + 60_000),
    ).toMatchObject(who);
  });

  it('ends after 12 hours', () => {
    const cookie = signPortalSession(secret, who, T0);
    expect(verifyPortalSession(secret, cookie, T0 + 11 * 3_600_000)).not.toBeNull();
    expect(verifyPortalSession(secret, cookie, T0 + 13 * 3_600_000)).toBeNull();
  });

  it('rejects a changed payload, another secret, and garbage', () => {
    const cookie = signPortalSession(secret, who, T0);
    const [, signature] = cookie.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...who, audience: 'candidate', exp: Math.floor(T0 / 1000) + 3600 }),
    ).toString('base64url');
    expect(verifyPortalSession(secret, `${forged}.${signature}`, T0)).toBeNull();
    expect(verifyPortalSession('another-secret-another-secret-0123', cookie, T0)).toBeNull();
    for (const bad of ['', 'x', 'a.b', undefined, null])
      expect(verifyPortalSession(secret, bad as never, T0)).toBeNull();
  });
});
