// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Price table in USD per million tokens (ADR-005, ADR-013). Maintained by hand when models or
 * prices change: an unknown model fails loudly instead of recording a wrong cost.
 */
export const PRICE_PER_MILLION_USD = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
} as const satisfies Record<string, { input: number; output: number }>;

export type PricedModel = keyof typeof PRICE_PER_MILLION_USD;

/**
 * Embedding prices in USD per million tokens (ADR-008): Voyage `voyage-3-large`, 1024 dimensions.
 * Checked against ADR-008's reported figure; re-check on the provider's price page when it changes.
 */
export const EMBEDDING_PRICE_PER_MILLION_USD = { 'voyage-3-large': 0.18 } as const;
export type EmbeddingModel = keyof typeof EMBEDDING_PRICE_PER_MILLION_USD;

/** The Claude API charges a fee per web search on top of tokens (ADR-005: $10 per 1,000 searches). */
export const WEB_SEARCH_USD_PER_REQUEST = 0.01;

/** Reading cached input costs a tenth of fresh input. */
const CACHE_READ_FACTOR = 0.1;

export interface TokenUsage {
  /** Fresh input tokens (the API reports cache reads separately). */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache. */
  cachedTokens: number;
  /** Web searches the call ran (`usage.server_tool_use.web_search_requests`); each has its own fee. */
  webSearchRequests?: number;
}

export function isPricedModel(model: string): model is PricedModel {
  return model in PRICE_PER_MILLION_USD;
}

/** Cost of one call, rounded to 6 decimals (the `LlmCall.costUsd` precision). */
export function costUsd(model: string, usage: TokenUsage): number {
  if (!isPricedModel(model))
    throw new Error(`No price for model "${model}"; add it to PRICE_PER_MILLION_USD`);
  const price = PRICE_PER_MILLION_USD[model];
  const dollars =
    (usage.inputTokens * price.input +
      usage.cachedTokens * price.input * CACHE_READ_FACTOR +
      usage.outputTokens * price.output) /
      1_000_000 +
    (usage.webSearchRequests ?? 0) * WEB_SEARCH_USD_PER_REQUEST;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}

export function isEmbeddingModel(model: string): model is EmbeddingModel {
  return model in EMBEDDING_PRICE_PER_MILLION_USD;
}

/** Cost of one embedding call: all tokens are input tokens. */
export function embeddingCostUsd(model: string, tokens: number): number {
  if (!isEmbeddingModel(model))
    throw new Error(
      `No price for embedding model "${model}"; add it to EMBEDDING_PRICE_PER_MILLION_USD`,
    );
  return (
    Math.round(((tokens * EMBEDDING_PRICE_PER_MILLION_USD[model]) / 1_000_000) * 1_000_000) /
    1_000_000
  );
}
