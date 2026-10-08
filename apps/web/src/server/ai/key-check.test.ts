// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { checkAnthropicKey } from './key-check';

const failing = (status: number | undefined, message: string) =>
  ({
    messages: { create: async () => Promise.reject(Object.assign(new Error(message), { status })) },
  }) as never;

describe('checkAnthropicKey', () => {
  it('says ok when the one-token call works', async () => {
    const calls: unknown[] = [];
    const client = { messages: { create: async (p: unknown) => (calls.push(p), {}) } } as never;
    expect(await checkAnthropicKey(client)).toEqual({ ok: true, message: 'ok' });
    expect(calls[0]).toMatchObject({ max_tokens: 1 });
  });
  it('tells a bad key, no credit and a network failure apart', async () => {
    expect(await checkAnthropicKey(failing(401, 'invalid x-api-key'))).toEqual({
      ok: false,
      message: 'invalid_key',
    });
    expect(await checkAnthropicKey(failing(400, 'Your credit balance is too low'))).toEqual({
      ok: false,
      message: 'no_credit',
    });
    expect(await checkAnthropicKey(failing(400, 'something else'))).toEqual({
      ok: false,
      message: 'unreachable',
    });
    expect(await checkAnthropicKey(failing(undefined, 'ECONNRESET'))).toEqual({
      ok: false,
      message: 'unreachable',
    });
  });
  it('never puts the key in the answer', async () => {
    const result = await checkAnthropicKey(failing(401, 'bad key sk-ant-secret'));
    expect(JSON.stringify(result)).not.toContain('sk-ant');
  });
});
