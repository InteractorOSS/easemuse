// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { clearPlatformAlert, recordPlatformAlert, withAgency } from '@/lib/db';
import { ANTHROPIC_ACCOUNT_ALERT } from '@/server/platform/secrets';
import { getEnv } from '@/lib/env';
import { createAnthropicClient } from './anthropic';
import { createFakeModelClient } from './fake/client';
import { createGateway, type Gateway } from './gateway';
import { promptRegistry } from './prompts';
import { registerBuiltInPrompts } from './prompts/index';

export { createGateway, type AiRunContext, type AiRunResult, type Gateway } from './gateway';
export { PURPOSES, isPurposeId, type PurposeId } from './purposes';
export { promptRegistry, type PromptModule } from './prompts';
export { toApiError } from './errors';

let gateway: Gateway | undefined;

/** The real model, or the local fake when AI_FAKE=on (refused in production by the environment check). */
function modelClient() {
  if (getEnv().AI_FAKE !== 'on') return createAnthropicClient();
  console.warn('[ai] AI_FAKE=on: AI drafts are canned answers from the fake model, not real AI');
  return createFakeModelClient();
}
let promptsRegistered = false;

/** The process-wide gateway. Built on first use so a missing API key only matters when AI is used. */
export function getGateway(): Gateway {
  if (!promptsRegistered) {
    registerBuiltInPrompts(promptRegistry);
    promptsRegistered = true;
  }
  gateway ??= createGateway({
    scope: { withAgency },
    model: modelClient(),
    prompts: promptRegistry,
    log: (message, data) => console.warn(`[ai] ${message}`, data),
    accountStatus: {
      report: (problem) => recordPlatformAlert(ANTHROPIC_ACCOUNT_ALERT, problem),
      clear: () => clearPlatformAlert(ANTHROPIC_ACCOUNT_ALERT),
    },
  });
  return gateway;
}
