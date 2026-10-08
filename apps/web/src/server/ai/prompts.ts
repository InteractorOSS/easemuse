// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { z } from 'zod';
import type { SearchResponse } from './anthropic';
import type { PurposeId } from './purposes';

/**
 * One AI capability = one prompt module (ADR-004): a version string recorded with every result, the
 * zod schema of the model's answer, and the function that builds the messages. Prompts are written
 * in English and say which language to answer in.
 */
export interface PromptModule<I = unknown, O = unknown> {
  purpose: PurposeId;
  /** Bump on every prompt change: it is stored in `AiGeneration` and `LlmCall` for provenance. */
  version: string;
  schema: z.ZodType<O>;
  /**
   * An optional first step that searches the web (ADR-005). Returning null skips it (search is not
   * switched on); `buildPrompt` and `toContent` then receive no research. The step's cost is
   * recorded as its own ledger row under the same generation.
   */
  research?: {
    buildRequest(
      input: I,
    ): { system: string; user: string; maxUses: number; blockedDomains: string[] } | null;
  };
  buildPrompt(input: I, research?: SearchResponse | null): { system: string; user: string };
  /** Maps the model's answer to artifact content; default is the answer itself. */
  toContent?(output: O, input: I, research?: SearchResponse | null): Record<string, unknown>;
}

export interface PromptRegistry {
  register<I, O>(module: PromptModule<I, O>): void;
  get(purpose: PurposeId): PromptModule | undefined;
}

export function createPromptRegistry(): PromptRegistry {
  const modules = new Map<PurposeId, PromptModule>();
  return {
    register(module) {
      if (modules.has(module.purpose))
        throw new Error(`Prompt already registered for ${module.purpose}`);
      modules.set(module.purpose, module as unknown as PromptModule);
    },
    get: (purpose) => modules.get(purpose),
  };
}

/** The process-wide registry; capability tasks (T-1-06, T-2-03, ...) register their modules here. */
export const promptRegistry = createPromptRegistry();
