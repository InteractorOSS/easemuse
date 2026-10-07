// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { hasMfa, mfaDecision } from './mfa';

describe('hasMfa', () => {
  it('accepts a second-factor amr value', () => {
    expect(hasMfa({ amr: ['pwd', 'otp'] })).toBe(true);
  });

  it('accepts an acr that names MFA', () => {
    expect(hasMfa({ acr: 'urn:example:mfa' })).toBe(true);
  });

  it('rejects password-only and missing claims', () => {
    expect(hasMfa({ amr: ['pwd'] })).toBe(false);
    expect(hasMfa({})).toBe(false);
    expect(hasMfa({ amr: 'otp' })).toBe(false);
  });
});

describe('mfaDecision', () => {
  it('allows anyone with MFA, and anyone when enforcement is off', () => {
    expect(mfaDecision({ enforcement: 'enforce', mfa: true })).toBe('allow');
    expect(mfaDecision({ enforcement: 'off', mfa: false })).toBe('allow');
  });

  it('logs in log mode and denies in enforce mode', () => {
    expect(mfaDecision({ enforcement: 'log', mfa: false })).toBe('allow_and_log');
    expect(mfaDecision({ enforcement: 'enforce', mfa: false })).toBe('deny');
  });
});
