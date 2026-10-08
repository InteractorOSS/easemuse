// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * End-to-end test mode (T-QA-06): the AI gateway answers from a canned stub instead of calling a
 * model. It is switched on only by `E2E_MODE=1` outside production, and the environment check
 * (lib/env.ts) refuses to start a production process that has it set, so the stub cannot answer for
 * a real customer. Nothing else changes in this mode: sign-in is NOT bypassed in the application
 * (the Playwright tests mint their own session cookie, see tests/e2e/support).
 */
export function isE2eMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.E2E_MODE === '1' && env.NODE_ENV !== 'production';
}

/** The problem with the settings, if any: E2E_MODE and production never go together. */
export function e2eModeProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.E2E_MODE && env.NODE_ENV === 'production'
    ? 'E2E_MODE must not be set in production: it replaces the AI with canned answers'
    : null;
}
