// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { withAgency } from '@/lib/db';
import { createAnthropicClient } from './anthropic';
import { createGateway, type Gateway } from './gateway';
import { promptRegistry } from './prompts';
import { registerBuiltInPrompts } from './prompts/index';

export { createGateway, type AiRunContext, type AiRunResult, type Gateway } from './gateway';
export { PURPOSES, isPurposeId, type PurposeId } from './purposes';
export { promptRegistry, type PromptModule } from './prompts';
export { toApiError } from './errors';

let gateway: Gateway | undefined;
let promptsRegistered = false;

/** The process-wide gateway. Built on first use so a missing API key only matters when AI is used. */
export function getGateway(): Gateway {
  if (!promptsRegistered) {
    registerBuiltInPrompts(promptRegistry);
    promptsRegistered = true;
  }
  gateway ??= createGateway({
    scope: { withAgency },
    model: createAnthropicClient(),
    prompts: promptRegistry,
  });
  return gateway;
}
