// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from './errors';
import { embeddingCostUsd } from './pricing';
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  checkVoyageKey,
  createVoyageClient,
  toVectorLiteral,
} from './voyage';

const vector = () => Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => i / 1000);
const reply = (n: number, tokens = 12) =>
  Response.json({
    data: Array.from({ length: n }, (_, index) => ({ index, embedding: vector() })),
    usage: { total_tokens: tokens },
  });

describe('Voyage client', () => {
  it('sends the text, the model, the size and the input type, with the key in the header only', async () => {
    const fetchMock = vi.fn(async () => reply(1));
    const client = createVoyageClient({ apiKey: 'pa-key', fetch: fetchMock as never });
    const out = await client.embed({ texts: ['Backend engineer'], inputType: 'document' });
    expect(out.model).toBe(EMBEDDING_MODEL);
    expect(out.tokens).toBe(12);
    expect(out.vectors[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.voyageai.com/v1/embeddings');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer pa-key');
    expect(JSON.parse(init.body as string)).toEqual({
      input: ['Backend engineer'],
      model: 'voyage-3-large',
      input_type: 'document',
      output_dimension: 1024,
      truncation: true,
    });
    expect(init.body).not.toContain('pa-key');
  });

  it('puts the vectors back in the order of the texts', async () => {
    const a = vector();
    const b = vector().map((x) => x + 1);
    const client = createVoyageClient({
      apiKey: 'pa-key',
      fetch: (async () =>
        Response.json({
          data: [
            { index: 1, embedding: b },
            { index: 0, embedding: a },
          ],
          usage: { total_tokens: 2 },
        })) as never,
    });
    const out = await client.embed({ texts: ['x', 'y'], inputType: 'query' });
    expect(out.vectors).toEqual([a, b]);
  });

  it('says plainly when no key is set, without calling Voyage', async () => {
    const fetchMock = vi.fn();
    const client = createVoyageClient({ apiKey: '', fetch: fetchMock as never });
    // An empty key counts as no key.
    await expect(client.embed({ texts: ['x'], inputType: 'query' })).rejects.toMatchObject({
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, false],
    [429, true],
    [503, true],
  ])('maps a %s answer (retryable: %s)', async (status, retryable) => {
    const client = createVoyageClient({
      apiKey: 'pa-key',
      fetch: (async () => new Response('no', { status })) as never,
    });
    await expect(client.embed({ texts: ['x'], inputType: 'query' })).rejects.toMatchObject({
      status,
      retryable,
    });
  });

  it('refuses an answer with the wrong size', async () => {
    const client = createVoyageClient({
      apiKey: 'pa-key',
      fetch: (async () =>
        Response.json({ data: [{ index: 0, embedding: [1, 2, 3] }], usage: {} })) as never,
    });
    await expect(client.embed({ texts: ['x'], inputType: 'query' })).rejects.toBeInstanceOf(
      AiProviderError,
    );
  });

  it('treats a network failure as retryable', async () => {
    const client = createVoyageClient({
      apiKey: 'pa-key',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as never,
    });
    await expect(client.embed({ texts: ['x'], inputType: 'query' })).rejects.toMatchObject({
      retryable: true,
    });
  });
});

describe('embedding cost', () => {
  it('is the token count at the listed price', () => {
    expect(embeddingCostUsd('voyage-3-large', 1_000_000)).toBe(0.18);
    expect(embeddingCostUsd('voyage-3-large', 2_000)).toBe(0.00036);
  });
  it('fails loudly for a model without a price', () => {
    expect(() => embeddingCostUsd('voyage-9', 10)).toThrow(/No price/);
  });
});

describe('vector literal and key check', () => {
  it('writes the pgvector text form', () => {
    expect(toVectorLiteral([0.5, -1, 2])).toBe('[0.5,-1,2]');
  });
  it('reports a working key, a refused key and a missing key', async () => {
    const ok = { embed: async () => ({ model: 'm', vectors: [], tokens: 1, latencyMs: 1 }) };
    expect(await checkVoyageKey(ok)).toEqual({ ok: true, message: 'ok' });
    const refused = {
      embed: async () => {
        throw new AiProviderError('provider error 401', false, 401);
      },
    };
    expect(await checkVoyageKey(refused)).toEqual({ ok: false, message: 'invalid_key' });
    const none = {
      embed: async () => {
        throw new AiProviderError('No Voyage API key is configured.', false);
      },
    };
    expect(await checkVoyageKey(none)).toEqual({ ok: false, message: 'no_key' });
  });
});
