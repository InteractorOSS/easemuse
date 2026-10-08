// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// The ONLY module (with the rest of server/ai) allowed to import the Anthropic SDK (ADR-004;
// enforced by ESLint). Everything else talks to models through the gateway.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { resolveAnthropicKey } from '@/server/platform/secrets';
import {
  AiCancelledError,
  AiInvalidOutputError,
  AiProviderError,
  AiRefusalError,
  AiTruncatedError,
} from './errors';
import type { TokenUsage } from './pricing';
import type { Effort } from './purposes';

export interface ModelRequest<T> {
  model: string;
  effort: Effort;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  /** Receives text as it is generated (partial JSON for structured output), for streaming drafts. */
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface ModelResponse<T> {
  parsed: T;
  usage: TokenUsage;
  stopReason: string;
  latencyMs: number;
}

/** What the gateway needs from a model provider; the Anthropic client below is the real one. */
export interface ModelClient {
  complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>>;
}

/** The slice of the SDK used here, so tests can inject a fake. */
export interface AnthropicLike {
  messages: {
    parse(params: never, options?: { signal?: AbortSignal }): Promise<unknown>;
    stream(
      params: never,
      options?: { signal?: AbortSignal },
    ): {
      on(event: 'text', listener: (delta: string) => void): unknown;
      finalMessage(): Promise<unknown>;
    };
  };
}

interface ParsedMessageLike {
  stop_reason: string | null;
  parsed_output: unknown;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };
}

/** Requests are given generous time: long drafts take a while (NFR-P04: under 45 s typical). */
const REQUEST_TIMEOUT_MS = 180_000;

export function createAnthropicClient(
  options: { apiKey?: string; client?: AnthropicLike; now?: () => number } = {},
): ModelClient {
  const now = options.now ?? (() => performance.now());
  // The key is looked up on every call (an owner can change it in the admin area), and the SDK
  // object is reused while the key stays the same.
  let current: { key: string; sdk: AnthropicLike } | null = null;
  const sdkFor = async (): Promise<AnthropicLike> => {
    if (options.client) return options.client;
    const apiKey = options.apiKey ?? (await resolveAnthropicKey());
    if (!apiKey) {
      throw new AiProviderError(
        'No Anthropic API key is configured. An owner can add it in the admin area.',
        false,
      );
    }
    if (current?.key !== apiKey) {
      current = {
        key: apiKey,
        sdk: new Anthropic({
          apiKey,
          maxRetries: 2,
          timeout: REQUEST_TIMEOUT_MS,
        }) as unknown as AnthropicLike,
      };
    }
    return current.sdk;
  };

  return {
    async complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
      const params = {
        model: request.model,
        max_tokens: request.maxTokens,
        // The system prompt is shared by every call of a purpose, so it is cached (ADR-013 cost control).
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: request.user }],
        // Structured output; NOT forced tool_choice, which Opus 5.5 rejects with a 400 (ADR-004).
        output_config: {
          effort: request.effort,
          format: zodOutputFormat(request.schema as z.ZodType),
        },
      } as never;
      const started = now();

      const sdk = await sdkFor();
      let message: ParsedMessageLike;
      try {
        if (request.onDelta) {
          const stream = sdk.messages.stream(params, { signal: request.signal });
          stream.on('text', request.onDelta);
          message = (await stream.finalMessage()) as ParsedMessageLike;
        } else {
          message = (await sdk.messages.parse(params, {
            signal: request.signal,
          })) as ParsedMessageLike;
        }
      } catch (error) {
        throw mapProviderError(error, request.signal);
      }

      const usage: TokenUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cachedTokens: message.usage.cache_read_input_tokens ?? 0,
      };
      // Always read stop_reason before the content (ADR-004).
      if (message.stop_reason === 'refusal') throw new AiRefusalError('refusal', usage);
      if (message.stop_reason === 'max_tokens') throw new AiTruncatedError('max_tokens', usage);
      if (message.parsed_output === null || message.parsed_output === undefined) {
        throw new AiInvalidOutputError('The answer could not be parsed', usage);
      }
      const checked = request.schema.safeParse(message.parsed_output);
      if (!checked.success)
        throw new AiInvalidOutputError('The answer did not match the schema', usage);

      return {
        parsed: checked.data,
        usage,
        stopReason: message.stop_reason ?? 'end_turn',
        latencyMs: Math.round(now() - started),
      };
    },
  };
}

function mapProviderError(error: unknown, signal?: AbortSignal): Error {
  if (signal?.aborted || error instanceof Anthropic.APIUserAbortError)
    return new AiCancelledError('cancelled');
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === 'number' ? error.status : null;
    return new AiProviderError(
      `provider error ${status ?? 'unknown'}`,
      status === null || status === 429 || status >= 500,
      status,
    );
  }
  // Network failures and timeouts surface as plain errors.
  return new AiProviderError('network error', true);
}
