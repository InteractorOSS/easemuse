// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { PURPOSES, type PurposeId } from '@/server/ai/purposes';
import { costUsd, type TokenUsage } from '@/server/ai/pricing';
import type { ModelClient, SearchResponse } from '@/server/ai/anthropic';
import type { PromptModule } from '@/server/ai/prompts';

export interface Run<O> {
  output: O;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
}

/** Calls the model for one prompt module with the same settings production uses, but no database. */
export async function runPrompt<I, O>(
  model: ModelClient,
  module: PromptModule<I, O>,
  input: I,
): Promise<Run<O>> {
  const spec = PURPOSES[module.purpose as PurposeId];
  const { system, user } = module.buildPrompt(input);
  const response = await model.complete({
    model: spec.model,
    effort: spec.effort,
    system,
    user,
    schema: module.schema,
    maxTokens: spec.maxTokens,
  });
  return {
    output: response.parsed,
    usage: response.usage,
    costUsd: costUsd(spec.model, response.usage),
    latencyMs: response.latencyMs,
  };
}

/** Spend across a whole run, with a ceiling so a bad loop cannot cost real money. */
export class CostMeter {
  total = 0;
  calls = 0;
  constructor(private readonly limitUsd: number) {}
  add(run: { costUsd: number }): void {
    this.total += run.costUsd;
    this.calls++;
    if (this.total > this.limitUsd) {
      throw new Error(
        `Eval cost limit of $${this.limitUsd} reached ($${this.total.toFixed(4)} after ${this.calls} calls)`,
      );
    }
  }
}

export interface ResearchedRun<O> extends Run<O> {
  /** The web search step, when the prompt has one and it ran. */
  research: SearchResponse | null;
}

/**
 * Like `runPrompt` for a prompt with a web search step (A3): searches first, hands the result to the
 * structuring step, and counts both calls (and the per-search fee) in the cost.
 */
export async function runResearchedPrompt<I, O>(
  model: ModelClient,
  module: PromptModule<I, O>,
  input: I,
): Promise<ResearchedRun<O>> {
  const spec = PURPOSES[module.purpose as PurposeId];
  const request = module.research?.buildRequest(input) ?? null;
  let research: SearchResponse | null = null;
  if (request) {
    if (!model.search) throw new Error('This model client cannot run a web search');
    research = await model.search({
      model: spec.model,
      effort: spec.effort,
      system: request.system,
      user: request.user,
      maxTokens: spec.maxTokens,
      maxUses: request.maxUses,
      blockedDomains: request.blockedDomains,
    });
  }
  const { system, user } = module.buildPrompt(input, research);
  const response = await model.complete({
    model: spec.model,
    effort: spec.effort,
    system,
    user,
    schema: module.schema,
    maxTokens: spec.maxTokens,
  });
  const searchCost = research ? costUsd(spec.model, research.usage) : 0;
  return {
    output: response.parsed,
    usage: response.usage,
    costUsd: costUsd(spec.model, response.usage) + searchCost,
    latencyMs: response.latencyMs + (research?.latencyMs ?? 0),
    research,
  };
}
