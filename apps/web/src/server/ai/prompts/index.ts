// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { PromptRegistry } from '../prompts';
import { factCheckVerifierPrompt } from './factcheck';
import { jdStructurePrompt } from './jd-structure';

/** Prompt modules that ship with the app. Capability tasks (T-1-06, T-2-03, ...) add theirs here. */
export function registerBuiltInPrompts(registry: PromptRegistry): void {
  registry.register(factCheckVerifierPrompt);
  registry.register(jdStructurePrompt);
}
