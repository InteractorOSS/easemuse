// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { supportAccessRequestSchema, supportGrantStatus } from './support';

const now = new Date('2026-10-10T12:00:00Z');
const base = {
  grantedById: null,
  expiresAt: null,
  deniedAt: null,
  revokedAt: null,
  createdAt: new Date('2026-10-09T12:00:00Z'),
};
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe('supportGrantStatus (FR-TEN-07)', () => {
  it('is pending until an admin decides, and lapses after 7 days', () => {
    expect(supportGrantStatus(base, now)).toBe('pending');
    expect(supportGrantStatus({ ...base, createdAt: new Date('2026-10-02T12:00:00Z') }, now)).toBe(
      'lapsed',
    );
  });
  it('is active only between approval and expiry', () => {
    const approved = { ...base, grantedById: 'u', expiresAt: hours(2) };
    expect(supportGrantStatus(approved, now)).toBe('active');
    expect(supportGrantStatus({ ...approved, expiresAt: hours(-1) }, now)).toBe('expired');
  });
  it('a revoked or denied grant never lets anyone in, whatever its expiry', () => {
    const approved = { ...base, grantedById: 'u', expiresAt: hours(2) };
    expect(supportGrantStatus({ ...approved, revokedAt: now }, now)).toBe('revoked');
    expect(supportGrantStatus({ ...base, deniedAt: now }, now)).toBe('denied');
  });
});

describe('supportAccessRequestSchema', () => {
  it('defaults to 24 hours, caps at 72, and needs a real reason', () => {
    expect(
      supportAccessRequestSchema.parse({ reason: 'Customer reported a missing report' }).hours,
    ).toBe(24);
    expect(
      supportAccessRequestSchema.safeParse({
        reason: 'Customer reported a missing report',
        hours: 73,
      }).success,
    ).toBe(false);
    expect(supportAccessRequestSchema.safeParse({ reason: 'short' }).success).toBe(false);
  });
});
