// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { signUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from './unsubscribe';

const secret = 'test-secret-with-enough-length-0123456789';
const agencyId = '11111111-1111-4111-8111-111111111111';

describe('unsubscribe token', () => {
  it('round-trips the agency and the lowercase address', () => {
    const token = signUnsubscribeToken({ secret, agencyId, address: 'Jane@Example.com' });
    expect(verifyUnsubscribeToken(secret, token)).toEqual({
      agencyId,
      address: 'jane@example.com',
    });
  });

  it('rejects a tampered token, a token signed with another secret and garbage', () => {
    const token = signUnsubscribeToken({ secret, agencyId, address: 'a@example.com' });
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(`${agencyId}|b@example.com`).toString('base64url');
    expect(verifyUnsubscribeToken(secret, `${forged}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken('another-secret-another-secret-123456', token)).toBeNull();
    expect(verifyUnsubscribeToken(secret, `${payload}`)).toBeNull();
    expect(verifyUnsubscribeToken(secret, '')).toBeNull();
  });

  it('builds the public link', () => {
    const url = unsubscribeUrl({
      baseUrl: 'https://app.example.com/',
      secret,
      agencyId,
      address: 'a@example.com',
    });
    expect(url).toMatch(/^https:\/\/app\.example\.com\/api\/public\/unsubscribe\/[\w-]+\.[\w-]+$/);
  });
});
