// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { createAnthropicClient, type AnthropicLike, type SearchRequest } from './anthropic';
import { AiWebSearchUnavailableError, toApiError } from './errors';
import { costUsd } from './pricing';

const request: SearchRequest = {
  model: 'claude-opus-5-5',
  effort: 'high',
  system: 'sys',
  user: 'user',
  maxTokens: 8000,
  maxUses: 5,
  blockedDomains: ['gartner.com'],
};

const usage = (searches: number) => ({
  input_tokens: 1000,
  output_tokens: 500,
  cache_read_input_tokens: 0,
  server_tool_use: { web_search_requests: searches },
});

function sdkReturning(
  ...messages: unknown[]
): AnthropicLike & { create: ReturnType<typeof vi.fn> } {
  const create = vi.fn();
  for (const m of messages) create.mockResolvedValueOnce(m);
  return { messages: { create, parse: vi.fn(), stream: vi.fn() }, create } as never;
}

describe('web search step', () => {
  it('sends the search tool with its cap and the blocked domains, and no structured output format', async () => {
    const sdk = sdkReturning({ stop_reason: 'end_turn', content: [], usage: usage(0) });
    await createAnthropicClient({ client: sdk }).search!(request);
    const params = sdk.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.tools).toEqual([
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 5,
        blocked_domains: ['gartner.com'],
      },
    ]);
    // Citations and structured output cannot be combined.
    expect(params.output_config).toEqual({ effort: 'high' });
  });

  it('labels cited pages, adds the labels after the passages, and keeps the page date', async () => {
    const sdk = sdkReturning({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'web_search_tool_result',
          content: [
            { url: 'https://jobs.example.com/a', title: 'Backend job', page_age: 'April 2026' },
            { url: 'https://jobs.example.com/unused', title: 'Never cited', page_age: null },
          ],
        },
        {
          type: 'text',
          text: 'Pay is 120k to 150k.',
          citations: [
            {
              type: 'web_search_result_location',
              url: 'https://jobs.example.com/a',
              title: 'Backend job',
              cited_text: '120,000 - 150,000',
            },
          ],
        },
        {
          type: 'text',
          text: ' Python is required.',
          citations: [{ url: 'https://jobs.example.com/a', cited_text: 'Python' }],
        },
      ],
      usage: usage(2),
    });
    const out = await createAnthropicClient({ client: sdk }).search!(request);
    expect(out.findings).toBe('Pay is 120k to 150k. [S1] Python is required. [S1]');
    expect(out.sources).toEqual([
      {
        id: 'S1',
        url: 'https://jobs.example.com/a',
        title: 'Backend job',
        pageAge: 'April 2026',
        citedTexts: ['120,000 - 150,000', 'Python'],
      },
    ]);
    expect(out.searches).toBe(2);
  });

  it('adds up the usage when a long turn pauses and is resumed', async () => {
    const sdk = sdkReturning(
      {
        stop_reason: 'pause_turn',
        content: [{ type: 'text', text: 'Part one.', citations: [] }],
        usage: usage(1),
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: ' Part two.', citations: [] }],
        usage: usage(2),
      },
    );
    const out = await createAnthropicClient({ client: sdk }).search!(request);
    expect(sdk.create).toHaveBeenCalledTimes(2);
    expect(out.usage).toMatchObject({
      inputTokens: 2000,
      outputTokens: 1000,
      webSearchRequests: 3,
    });
    expect(out.findings).toBe('Part one. Part two.');
  });

  it('reports no findings and no searches when the model answered without searching', async () => {
    const sdk = sdkReturning({ stop_reason: 'end_turn', content: [], usage: usage(0) });
    const out = await createAnthropicClient({ client: sdk }).search!(request);
    expect(out).toMatchObject({ findings: '', sources: [], searches: 0 });
  });

  it('turns a refused tool or an unavailable search into one clear error', async () => {
    const unavailable = sdkReturning({
      stop_reason: 'end_turn',
      content: [{ type: 'web_search_tool_result', content: { error_code: 'unavailable' } }],
      usage: usage(1),
    });
    await expect(
      createAnthropicClient({ client: unavailable }).search!(request),
    ).rejects.toBeInstanceOf(AiWebSearchUnavailableError);
    const rejected = sdkReturning();
    rejected.create.mockRejectedValueOnce(
      new Anthropic.BadRequestError(
        400,
        { error: { message: 'web_search tool is not enabled for this organization' } } as never,
        'web_search tool is not enabled',
        new Headers(),
      ),
    );
    const error = await createAnthropicClient({ client: rejected }).search!(request).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(AiWebSearchUnavailableError);
    expect(toApiError(error)).toMatchObject({ code: 'web_search_unavailable', status: 503 });
  });
});

describe('web search fee', () => {
  it('adds one cent per search to the token cost', () => {
    const tokens = { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0 };
    expect(costUsd('claude-opus-5-5', tokens)).toBe(4);
    expect(costUsd('claude-opus-5-5', { ...tokens, webSearchRequests: 5 })).toBe(4.05);
  });
});
