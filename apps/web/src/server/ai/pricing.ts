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

/** Reading cached input costs a tenth of fresh input. */
const CACHE_READ_FACTOR = 0.1;

export interface TokenUsage {
  /** Fresh input tokens (the API reports cache reads separately). */
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the prompt cache. */
  cachedTokens: number;
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
    1_000_000;
  return Math.round(dollars * 1_000_000) / 1_000_000;
}
