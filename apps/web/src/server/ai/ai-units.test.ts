// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ARTIFACT_KINDS } from '@easemuse/core';
import { createAnthropicClient, type AnthropicLike } from './anthropic';
import {
  accountProblemOf,
  AiAccountError,
  AiCancelledError,
  AiInvalidOutputError,
  AiProviderError,
  AiRefusalError,
  AiTruncatedError,
  toApiError,
} from './errors';
import { budgetLevel, monthStart } from './ledger';
import { PRICE_PER_MILLION_USD, costUsd } from './pricing';
import { createPromptRegistry } from './prompts';
import { PURPOSES, isPurposeId } from './purposes';

describe('pricing', () => {
  it('prices input, cached input and output per million tokens', () => {
    // Opus: $4 in, $20 out. 1M fresh in + 1M out = $24.
    expect(
      costUsd('claude-opus-5-5', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cachedTokens: 0,
      }),
    ).toBe(24);
    // Cached reads cost a tenth of fresh input.
    expect(
      costUsd('claude-opus-5-5', { inputTokens: 0, outputTokens: 0, cachedTokens: 1_000_000 }),
    ).toBe(0.4);
    expect(
      costUsd('claude-sonnet-5-5', { inputTokens: 1_500, outputTokens: 800, cachedTokens: 20_000 }),
    ).toBe(0.015); // 3000 + 4000 + 8000 micro-dollars
  });

  it('rounds to the ledger precision and refuses unknown models', () => {
    expect(costUsd('claude-haiku-4-5', { inputTokens: 1, outputTokens: 1, cachedTokens: 0 })).toBe(
      0.000006,
    );
    expect(() => costUsd('gpt-x', { inputTokens: 1, outputTokens: 1, cachedTokens: 0 })).toThrow(
      /No price/,
    );
  });
});

describe('routing table (ADR-005)', () => {
  const entries = Object.entries(PURPOSES);

  it('covers A1 to A18 and X1 exactly once', () => {
    const codes = entries.map(([, p]) => p.code).sort();
    const expected = [...Array.from({ length: 18 }, (_, i) => `A${i + 1}`), 'X1'].sort();
    expect(codes).toEqual(expected);
  });

  it('routes every purpose to a priced model with an explicit effort and a sane output limit', () => {
    for (const [id, p] of entries) {
      expect(p.model in PRICE_PER_MILLION_USD, id).toBe(true);
      expect(['low', 'medium', 'high']).toContain(p.effort);
      expect(p.maxTokens).toBeGreaterThanOrEqual(4_000);
    }
  });

  it('points artifact purposes at real kinds, each kind used at most once', () => {
    const kinds = entries
      .map(([, p]) => p.artifactKind)
      .filter((k): k is NonNullable<typeof k> => k !== null);
    for (const kind of kinds) expect(ARTIFACT_KINDS).toContain(kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('follows the ADR-005 split: Opus for client-facing and decisions, Sonnet for extraction', () => {
    for (const id of [
      'jd.structure',
      'success_profile.create',
      'match.analyze',
      'outreach.draft',
      'resume.tailor',
      'report.draft',
    ] as const) {
      expect(PURPOSES[id].model, id).toBe('claude-opus-5-5');
    }
    for (const id of [
      'intake.questions',
      'search_criteria.create',
      'profile.structure',
      'call.questions',
      'notes.qualify',
      'feedback.structure',
      'factcheck.verify',
    ] as const) {
      expect(PURPOSES[id].model, id).toBe('claude-sonnet-5-5');
    }
    expect(PURPOSES['match.analyze'].effort).toBe('high');
    expect(PURPOSES['jd.structure'].effort).toBe('medium');
  });

  it('recognises purpose ids', () => {
    expect(isPurposeId('jd.structure')).toBe(true);
    expect(isPurposeId('embedding.index')).toBe(false);
    expect(isPurposeId('nope')).toBe(false);
  });
});

describe('budget levels (US-1304)', () => {
  it('has no limit, then ok, warning at 80% and over at 100%', () => {
    expect(budgetLevel(500, null)).toMatchObject({ level: 'ok', ratio: null });
    expect(budgetLevel(79.9, 100).level).toBe('ok');
    expect(budgetLevel(80, 100).level).toBe('warning');
    expect(budgetLevel(99.99, 100).level).toBe('warning');
    expect(budgetLevel(100, 100).level).toBe('over');
    expect(budgetLevel(1, 0).level).toBe('over');
  });

  it('counts months in UTC', () => {
    expect(monthStart(new Date('2026-10-31T23:59:59Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    expect(monthStart(new Date('2026-11-01T00:00:00Z')).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    );
  });
});

describe('prompt registry', () => {
  const sample = {
    purpose: 'jd.structure' as const,
    version: 'v1',
    schema: z.object({ a: z.string() }),
    buildPrompt: () => ({ system: 's', user: 'u' }),
  };
  it('registers a module once per purpose', () => {
    const registry = createPromptRegistry();
    expect(registry.get('jd.structure')).toBeUndefined();
    registry.register(sample);
    expect(registry.get('jd.structure')?.version).toBe('v1');
    expect(() => registry.register(sample)).toThrow(/already registered/);
  });
});

describe('error mapping', () => {
  it('turns failures into safe API errors without leaking internals', () => {
    expect(toApiError(new AiRefusalError('refusal'))).toMatchObject({
      status: 422,
      code: 'ai_refused',
    });
    expect(toApiError(new AiTruncatedError('x'))).toMatchObject({ status: 502, code: 'ai_failed' });
    expect(toApiError(new AiInvalidOutputError('schema details here'))).toMatchObject({
      status: 502,
    });
    expect(toApiError(new AiInvalidOutputError('schema details here')).message).not.toContain(
      'schema details',
    );
    expect(toApiError(new AiProviderError('provider error 500', true, 500))).toMatchObject({
      status: 503,
      code: 'ai_unavailable',
    });
    expect(toApiError(new AiCancelledError('c'))).toMatchObject({ code: 'ai_cancelled' });
    // Account problems say what is wrong and who can fix it; retrying would not help.
    const noCredit = toApiError(new AiAccountError('no_credit', 400));
    expect(noCredit).toMatchObject({ status: 503, code: 'ai_account_no_credit' });
    expect(noCredit.message).toMatch(/credit/);
    expect(noCredit.message).not.toMatch(/try again/i);
    expect(toApiError(new AiAccountError('invalid_key', 401))).toMatchObject({
      status: 503,
      code: 'ai_account_key',
    });
    expect(toApiError(new AiAccountError('no_key'))).toMatchObject({ code: 'ai_account_key' });
    expect(toApiError(new Error('boom'))).toMatchObject({ status: 500 });
  });
});

describe('account problems', () => {
  it('reads no credit and rejected keys from the provider response, and nothing else', () => {
    expect(
      accountProblemOf(400, 'Your credit balance is too low to access the Anthropic API.'),
    ).toBe('no_credit');
    expect(accountProblemOf(402, 'credit balance')).toBe('no_credit');
    expect(accountProblemOf(401, 'invalid x-api-key')).toBe('invalid_key');
    expect(accountProblemOf(403, 'permission')).toBe('invalid_key');
    expect(accountProblemOf(400, 'max_tokens is too large')).toBeNull();
    expect(accountProblemOf(500, 'credit balance')).toBeNull();
    expect(accountProblemOf(null, 'credit balance')).toBeNull();
  });
});

describe('Anthropic client adapter (ADR-004)', () => {
  const schema = z.object({ title: z.string() });
  const usage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 2000 };
  const request = {
    model: 'claude-opus-5-5',
    effort: 'high' as const,
    system: 'You are careful.',
    user: 'Structure this.',
    schema,
    maxTokens: 1000,
  };

  function fake(message: unknown, behaviour: { streamDeltas?: string[]; throws?: unknown } = {}) {
    const parse = vi.fn(async () => {
      if (behaviour.throws) throw behaviour.throws;
      return message;
    });
    const stream = vi.fn(() => {
      let onText: (d: string) => void = () => undefined;
      return {
        on: (_event: 'text', listener: (d: string) => void) => {
          onText = listener;
        },
        finalMessage: async () => {
          if (behaviour.throws) throw behaviour.throws;
          behaviour.streamDeltas?.forEach(onText);
          return message;
        },
      };
    });
    return { sdk: { messages: { parse, stream } } as unknown as AnthropicLike, parse, stream };
  }

  it('asks for structured output with explicit effort, a cached system prompt and no forced tool choice', async () => {
    const { sdk, parse } = fake({
      stop_reason: 'end_turn',
      parsed_output: { title: 'Engineer' },
      usage,
    });
    const result = await createAnthropicClient({ client: sdk }).complete(request);
    expect(result.parsed).toEqual({ title: 'Engineer' });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, cachedTokens: 2000 });
    const params = (parse.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: 'Structure this.' }],
      system: [{ type: 'text', text: 'You are careful.', cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'high' },
    });
    expect(params).not.toHaveProperty('tool_choice');
    expect((params.output_config as { format: { type: string } }).format.type).toBe('json_schema');
  });

  it('streams text deltas to the caller and still returns the parsed answer', async () => {
    const { sdk, stream, parse } = fake(
      { stop_reason: 'end_turn', parsed_output: { title: 'T' }, usage },
      { streamDeltas: ['{"ti', 'tle":"T"}'] },
    );
    const deltas: string[] = [];
    const result = await createAnthropicClient({ client: sdk }).complete({
      ...request,
      onDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(['{"ti', 'tle":"T"}']);
    expect(result.parsed).toEqual({ title: 'T' });
    expect(stream).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
  });

  it('reads stop_reason first: a refusal or truncation is an error that still reports usage', async () => {
    const refusal = fake({ stop_reason: 'refusal', parsed_output: null, usage });
    const error = await createAnthropicClient({ client: refusal.sdk })
      .complete(request)
      .catch((e) => e);
    expect(error).toBeInstanceOf(AiRefusalError);
    expect(error.usage).toEqual({ inputTokens: 100, outputTokens: 50, cachedTokens: 2000 });

    const truncated = fake({ stop_reason: 'max_tokens', parsed_output: { title: 'half' }, usage });
    expect(
      await createAnthropicClient({ client: truncated.sdk })
        .complete(request)
        .catch((e) => e),
    ).toBeInstanceOf(AiTruncatedError);
  });

  it('rejects an empty or schema-violating answer', async () => {
    const empty = fake({ stop_reason: 'end_turn', parsed_output: null, usage });
    expect(
      await createAnthropicClient({ client: empty.sdk })
        .complete(request)
        .catch((e) => e),
    ).toBeInstanceOf(AiInvalidOutputError);
    const wrong = fake({ stop_reason: 'end_turn', parsed_output: { title: 42 }, usage });
    expect(
      await createAnthropicClient({ client: wrong.sdk })
        .complete(request)
        .catch((e) => e),
    ).toBeInstanceOf(AiInvalidOutputError);
  });

  it('maps provider failures, marking 429 and 5xx as retryable and 4xx as not', async () => {
    const make = (status: number) =>
      new Anthropic.APIError(status, { type: 'error' }, 'x', new Headers());
    for (const [status, retryable] of [
      [429, true],
      [500, true],
      [529, true],
      [400, false],
    ] as const) {
      const { sdk } = fake(null, { throws: make(status) });
      const error = await createAnthropicClient({ client: sdk })
        .complete(request)
        .catch((e) => e);
      expect(error).toBeInstanceOf(AiProviderError);
      expect(error.retryable, String(status)).toBe(retryable);
    }
    const net = fake(null, { throws: new TypeError('fetch failed') });
    expect(
      (
        await createAnthropicClient({ client: net.sdk })
          .complete(request)
          .catch((e) => e)
      ).retryable,
    ).toBe(true);
  });

  it('maps no credit, a rejected key and a missing key to account errors', async () => {
    const credit = fake(null, {
      throws: new Anthropic.APIError(
        400,
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low to access the Anthropic API.',
          },
        },
        undefined,
        new Headers(),
      ),
    });
    const noCredit = await createAnthropicClient({ client: credit.sdk })
      .complete(request)
      .catch((e) => e);
    expect(noCredit).toBeInstanceOf(AiAccountError);
    expect(noCredit).toMatchObject({ problem: 'no_credit', status: 400 });

    const rejected = fake(null, {
      throws: new Anthropic.APIError(401, { type: 'error' }, 'invalid x-api-key', new Headers()),
    });
    expect(
      await createAnthropicClient({ client: rejected.sdk })
        .complete(request)
        .catch((e) => e),
    ).toMatchObject({ problem: 'invalid_key', status: 401 });

    expect(
      await createAnthropicClient({ apiKey: '' })
        .complete(request)
        .catch((e) => e),
    ).toMatchObject({ problem: 'no_key' });
  });

  it('maps an abort to a cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const { sdk } = fake(null, { throws: new Anthropic.APIUserAbortError() });
    const error = await createAnthropicClient({ client: sdk })
      .complete({ ...request, signal: controller.signal })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AiCancelledError);
  });
});
