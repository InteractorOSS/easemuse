// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// The Voyage AI embeddings client (ADR-008). Voyage is the single embedding provider and a listed
// sub-processor: there is no silent fallback to another provider. Only text prepared by the caller
// is sent; callers must already have removed names and contact details (FR-AI-09).
import { resolveVoyageKey } from '@/server/platform/secrets';
import { AiCancelledError, AiProviderError } from './errors';

export const EMBEDDING_MODEL = 'voyage-3-large';
export const EMBEDDING_DIMENSIONS = 1024;
const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const REQUEST_TIMEOUT_MS = 30_000;
/** Longest text sent for one embedding; Voyage truncates beyond its own limit as well. */
export const MAX_EMBED_CHARS = 60_000;

export interface EmbedRequest {
  texts: string[];
  /** `document` for stored profiles, `query` for the text a search starts from. */
  inputType: 'document' | 'query';
  signal?: AbortSignal;
}

export interface EmbedResponse {
  model: string;
  vectors: number[][];
  /** Tokens Voyage counted, which is what it charges for. */
  tokens: number;
  latencyMs: number;
}

/** What the application needs from an embedding provider; the Voyage client below is the real one. */
export interface EmbeddingClient {
  embed(request: EmbedRequest): Promise<EmbedResponse>;
}

interface VoyageBody {
  data?: { embedding?: number[]; index?: number }[];
  usage?: { total_tokens?: number };
}

export function createVoyageClient(
  options: {
    apiKey?: string;
    fetch?: typeof fetch;
    now?: () => number;
  } = {},
): EmbeddingClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => performance.now());
  return {
    async embed(request) {
      if (request.texts.length === 0) throw new Error('Nothing to embed');
      // The key is looked up on every call: an owner can change it in the admin area.
      const apiKey = options.apiKey ?? (await resolveVoyageKey());
      if (!apiKey) {
        throw new AiProviderError(
          'No Voyage API key is configured. An owner can add it in the admin area.',
          false,
        );
      }
      const started = now();
      let response: Response;
      try {
        const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
        response = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: request.texts.map((t) => t.slice(0, MAX_EMBED_CHARS)),
            model: EMBEDDING_MODEL,
            input_type: request.inputType,
            output_dimension: EMBEDDING_DIMENSIONS,
            truncation: true,
          }),
          signal: request.signal ? AbortSignal.any([request.signal, timeout]) : timeout,
        });
      } catch (error) {
        if (request.signal?.aborted) throw new AiCancelledError('cancelled');
        throw new AiProviderError(
          (error as Error).name === 'TimeoutError' ? 'timeout' : 'network error',
          true,
        );
      }
      if (!response.ok) {
        const status = response.status;
        throw new AiProviderError(
          `provider error ${status}`,
          status === 429 || status >= 500,
          status,
        );
      }
      const body = (await response.json().catch(() => null)) as VoyageBody | null;
      const rows = [...(body?.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectors = rows.map((r) => r.embedding);
      if (
        vectors.length !== request.texts.length ||
        vectors.some((v) => !Array.isArray(v) || v.length !== EMBEDDING_DIMENSIONS)
      ) {
        throw new AiProviderError('unexpected embedding response', false);
      }
      return {
        model: EMBEDDING_MODEL,
        vectors: vectors as number[][],
        tokens: body?.usage?.total_tokens ?? 0,
        latencyMs: Math.round(now() - started),
      };
    },
  };
}

/** pgvector text form of a vector, for `$1::vector`. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`;
}

export interface VoyageKeyCheck {
  ok: boolean;
  message: 'ok' | 'no_key' | 'invalid_key' | 'no_credit' | 'unreachable';
}

/** Embeds one word to find out whether the key in use works and has credit (a fraction of a cent). */
export async function checkVoyageKey(
  client: EmbeddingClient = createVoyageClient(),
): Promise<VoyageKeyCheck> {
  try {
    await client.embed({ texts: ['hello'], inputType: 'query' });
    return { ok: true, message: 'ok' };
  } catch (error) {
    if (error instanceof AiProviderError) {
      if (/No Voyage API key/.test(error.message)) return { ok: false, message: 'no_key' };
      if (error.status === 401 || error.status === 403)
        return { ok: false, message: 'invalid_key' };
      if (error.status === 402 || error.status === 429)
        return { ok: false, message: error.status === 402 ? 'no_credit' : 'unreachable' };
    }
    return { ok: false, message: 'unreachable' };
  }
}
