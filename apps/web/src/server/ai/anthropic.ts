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
  accountProblemOf,
  AiAccountError,
  AiCallError,
  AiCancelledError,
  AiInvalidOutputError,
  AiProviderError,
  AiRefusalError,
  AiTruncatedError,
  AiWebSearchUnavailableError,
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

/** A web search step (ADR-005): the model searches and writes a cited summary. No structured output here: citations and `output_config.format` cannot be combined. */
export interface SearchRequest {
  model: string;
  effort: Effort;
  system: string;
  user: string;
  maxTokens: number;
  /** Cap on searches in this step (the tool's `max_uses`). */
  maxUses: number;
  /** Domains the search must not use (paid sources). */
  blockedDomains: string[];
  signal?: AbortSignal;
}

/** A page the summary cites. `id` is the label ("S1") the text carries. */
export interface SearchSource {
  id: string;
  url: string;
  title: string;
  /** The page's own date as the search reports it, if any. */
  pageAge: string | null;
  /** Short passages of the page the summary relies on. */
  citedTexts: string[];
}

export interface SearchResponse {
  /** The summary with a "[S1]" label after each cited passage. */
  findings: string;
  /** Only pages that are cited in `findings`. */
  sources: SearchSource[];
  searches: number;
  usage: TokenUsage;
  latencyMs: number;
}

/** What the gateway needs from a model provider; the Anthropic client below is the real one. */
export interface ModelClient {
  complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>>;
  /** Present on clients that can run the web search step. */
  search?(request: SearchRequest): Promise<SearchResponse>;
}

/** The slice of the SDK used here, so tests can inject a fake. */
export interface AnthropicLike {
  messages: {
    create?(params: never, options?: { signal?: AbortSignal }): Promise<unknown>;
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
    if (!apiKey) throw new AiAccountError('no_key');
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

    async search(request: SearchRequest): Promise<SearchResponse> {
      const sdk = await sdkFor();
      if (!sdk.messages.create) throw new Error('This client cannot run a web search');
      const started = now();
      const messages: unknown[] = [{ role: 'user', content: request.user }];
      const usage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        webSearchRequests: 0,
      };
      const results = new Map<string, { title: string; pageAge: string | null }>();
      const cited = new Map<string, SearchSource>();
      let findings = '';

      // A long search turn can pause; resume it a few times at most.
      for (let turn = 0; turn < 4; turn++) {
        const params = {
          model: request.model,
          max_tokens: request.maxTokens,
          system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
          messages,
          output_config: { effort: request.effort },
          tools: [
            {
              type: 'web_search_20260209',
              name: 'web_search',
              max_uses: request.maxUses,
              ...(request.blockedDomains.length ? { blocked_domains: request.blockedDomains } : {}),
            },
          ],
        } as never;
        let message: SearchMessageLike;
        try {
          message = (await sdk.messages.create(params, {
            signal: request.signal,
          })) as SearchMessageLike;
        } catch (error) {
          if (error instanceof Anthropic.BadRequestError && /web.?search/i.test(error.message))
            throw new AiWebSearchUnavailableError('web search is not enabled');
          throw mapProviderError(error, request.signal);
        }
        usage.inputTokens += message.usage.input_tokens;
        usage.outputTokens += message.usage.output_tokens;
        usage.cachedTokens += message.usage.cache_read_input_tokens ?? 0;
        usage.webSearchRequests! += message.usage.server_tool_use?.web_search_requests ?? 0;
        if (message.stop_reason === 'refusal') throw new AiRefusalError('refusal', usage);
        if (message.stop_reason === 'max_tokens') throw new AiTruncatedError('max_tokens', usage);

        for (const block of message.content) {
          if (block.type === 'web_search_tool_result') {
            if (Array.isArray(block.content)) {
              for (const r of block.content)
                if (r.url)
                  results.set(r.url, { title: r.title ?? '', pageAge: r.page_age ?? null });
            } else if (block.content?.error_code === 'unavailable') {
              throw new AiWebSearchUnavailableError('web search is unavailable');
            }
          } else if (block.type === 'text') {
            const labels: string[] = [];
            for (const c of block.citations ?? []) {
              if (!c.url) continue;
              let source = cited.get(c.url);
              if (!source) {
                const found = results.get(c.url);
                source = {
                  id: `S${cited.size + 1}`,
                  url: c.url,
                  title: c.title ?? found?.title ?? '',
                  pageAge: found?.pageAge ?? null,
                  citedTexts: [],
                };
                cited.set(c.url, source);
              }
              if (
                c.cited_text &&
                !source.citedTexts.includes(c.cited_text) &&
                source.citedTexts.length < 3
              )
                source.citedTexts.push(c.cited_text);
              if (!labels.includes(source.id)) labels.push(source.id);
            }
            findings += block.text + labels.map((l) => ` [${l}]`).join('');
          }
        }
        if (message.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: message.content });
      }
      if (!(findings.trim().length > 0) && usage.webSearchRequests === 0 && cited.size === 0) {
        // The model answered without searching: there is nothing to cite, and the caller says so.
        return {
          findings: '',
          sources: [],
          searches: 0,
          usage,
          latencyMs: Math.round(now() - started),
        };
      }
      return {
        findings: findings.trim(),
        sources: [...cited.values()],
        searches: usage.webSearchRequests ?? 0,
        usage,
        latencyMs: Math.round(now() - started),
      };
    },
  };
}

interface SearchMessageLike {
  stop_reason: string | null;
  content: {
    type: string;
    text?: string;
    citations?: { url?: string; title?: string; cited_text?: string }[] | null;
    content?:
      { url?: string; title?: string; page_age?: string | null }[] | { error_code?: string } | null;
  }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    server_tool_use?: { web_search_requests?: number } | null;
  };
}

function mapProviderError(error: unknown, signal?: AbortSignal): Error {
  if (error instanceof AiCallError) return error;
  if (signal?.aborted || error instanceof Anthropic.APIUserAbortError)
    return new AiCancelledError('cancelled');
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === 'number' ? error.status : null;
    // No credit or a rejected key: retrying cannot help, and an administrator has to act.
    const problem = accountProblemOf(
      status,
      `${error.message} ${JSON.stringify(error.error ?? '')}`,
    );
    if (problem) return new AiAccountError(problem, status);
    return new AiProviderError(
      `provider error ${status ?? 'unknown'}`,
      status === null || status === 429 || status >= 500,
      status,
    );
  }
  // Network failures and timeouts surface as plain errors.
  return new AiProviderError('network error', true);
}
