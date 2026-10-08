// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { PromptRegistry } from '../prompts';
import { callQuestionsPrompt } from './call-questions';
import { factCheckVerifierPrompt } from './factcheck';
import { intakeQuestionsPrompt } from './intake-questions';
import { jdStructurePrompt } from './jd-structure';
import { matchAnalyzePrompt } from './match-analyze';
import { outreachDraftPrompt } from './outreach-draft';
import { patternSummarizePrompt } from './pattern-summarize';
import { profileStructurePrompt } from './profile-structure';
import { qualifyNotesPrompt } from './qualify-notes';
import { reportDraftPrompt } from './report-draft';
import { resumeTailorPrompt } from './resume-tailor';
import { screeningPrefillPrompt } from './screening-prefill';
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
  registry.register(outreachDraftPrompt);
  registry.register(callQuestionsPrompt);
  registry.register(qualifyNotesPrompt);
  registry.register(resumeTailorPrompt);
  registry.register(reportDraftPrompt);
  registry.register(screeningPrefillPrompt);
  registry.register(patternSummarizePrompt);
}
