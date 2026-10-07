// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { PromptRegistry } from '../prompts';
import { factCheckVerifierPrompt } from './factcheck';
import { intakeQuestionsPrompt } from './intake-questions';
import { jdStructurePrompt } from './jd-structure';
import { matchAnalyzePrompt } from './match-analyze';
import { profileStructurePrompt } from './profile-structure';
import { searchCriteriaPrompt } from './search-criteria';
import { successProfilePrompt } from './success-profile';

/** Prompt modules that ship with the app. Capability tasks (T-1-06, T-2-03, ...) add theirs here. */
export function registerBuiltInPrompts(registry: PromptRegistry): void {
  registry.register(factCheckVerifierPrompt);
  registry.register(jdStructurePrompt);
  registry.register(intakeQuestionsPrompt);
  registry.register(successProfilePrompt);
  registry.register(searchCriteriaPrompt);
  registry.register(profileStructurePrompt);
  registry.register(matchAnalyzePrompt);
}
