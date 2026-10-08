// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ModelClient, ModelRequest, ModelResponse, SearchResponse } from '../anthropic';
import { AiWebSearchUnavailableError } from '../errors';
import { fakeOutput } from './outputs';

const NO_TOKENS = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };

/**
 * The local fake AI model (AI_FAKE=on): answers every purpose with a canned, schema-valid draft so
 * the whole application, including the gateway, drafts, approvals and the fact check, runs without
 * a provider or credit. It records no tokens, so budgets are untouched. Never used in production:
 * the environment refuses AI_FAKE there, and this factory refuses too.
 */
export function createFakeModelClient(options: { nodeEnv?: string } = {}): ModelClient {
  if ((options.nodeEnv ?? process.env.NODE_ENV) === 'production') {
    throw new Error('The fake AI model cannot run in production');
  }
  return {
    async complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
      if (!request.purpose) throw new Error('The fake AI model needs the purpose of the call');
      const parsed = request.schema.parse(fakeOutput(request.purpose, request.input));
      // Stream the answer once, as the real client streams partial JSON.
      request.onDelta?.(JSON.stringify(parsed));
      return { parsed, usage: NO_TOKENS, stopReason: 'end_turn', latencyMs: 1 };
    },
    async search(): Promise<SearchResponse> {
      // The benchmark's web step is not simulated: it reports itself unavailable, as with WEB_SEARCH=off.
      throw new AiWebSearchUnavailableError('web search is not available with the fake AI model');
    },
  };
}
