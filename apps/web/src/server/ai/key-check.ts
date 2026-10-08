// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Anthropic from '@anthropic-ai/sdk';
import { resolveAnthropicKey } from '@/server/platform/secrets';
import { accountProblemOf } from './errors';

export interface KeyCheck {
  ok: boolean;
  /** A plain-language reason, never the key itself. */
  message: 'ok' | 'no_key' | 'invalid_key' | 'no_credit' | 'unreachable';
}

/**
 * Asks the cheapest model for one token to find out whether the key in use works and has credit.
 * Costs a fraction of a cent. Called only when an admin clicks "Test the key".
 */
export async function checkAnthropicKey(client?: Pick<Anthropic, 'messages'>): Promise<KeyCheck> {
  let sdk = client;
  if (!sdk) {
    const apiKey = await resolveAnthropicKey();
    if (!apiKey) return { ok: false, message: 'no_key' };
    sdk = new Anthropic({ apiKey, maxRetries: 0, timeout: 20_000 });
  }
  try {
    await sdk.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });
    return { ok: true, message: 'ok' };
  } catch (error) {
    const status = (error as { status?: number }).status;
    const text = String((error as Error).message ?? '');
    const problem = accountProblemOf(status, text);
    return { ok: false, message: problem && problem !== 'no_key' ? problem : 'unreachable' };
  }
}
