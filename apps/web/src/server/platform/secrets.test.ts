// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, validateAnthropicKey } from './secrets';

const KEY = 'auth-secret-for-tests-0123456789abcdef';
const ANTHROPIC = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123';

describe('secret encryption', () => {
  it('round-trips, and never stores the plain text', () => {
    const stored = encryptSecret(ANTHROPIC, KEY);
    expect(stored).not.toContain(ANTHROPIC);
    expect(stored.startsWith('v1.')).toBe(true);
    expect(decryptSecret(stored, KEY)).toBe(ANTHROPIC);
  });

  it('uses a fresh nonce each time', () => {
    expect(encryptSecret(ANTHROPIC, KEY)).not.toBe(encryptSecret(ANTHROPIC, KEY));
  });

  it('returns null for another key, a changed value and garbage, without throwing', () => {
    const stored = encryptSecret(ANTHROPIC, KEY);
    expect(decryptSecret(stored, 'another-secret-another-secret-123456')).toBeNull();
    const [v, iv, tag, body] = stored.split('.');
    expect(decryptSecret([v, iv, tag, `${body!.slice(0, -2)}AA`].join('.'), KEY)).toBeNull();
    for (const bad of ['', 'x', 'v1.a.b', 'v2.a.b.c']) expect(decryptSecret(bad, KEY)).toBeNull();
  });
});

describe('validateAnthropicKey', () => {
  it('accepts a key and trims it', () => {
    expect(validateAnthropicKey(`  ${ANTHROPIC}\n`)).toBe(ANTHROPIC);
  });
  it('refuses anything else', () => {
    for (const bad of [
      '',
      'hello',
      'sk-proj-abcdefghijklmnopqrstuvwxyz',
      'sk-ant-short',
      `${ANTHROPIC} extra`,
    ]) {
      expect(() => validateAnthropicKey(bad)).toThrow(/Anthropic API key/);
    }
  });
});
