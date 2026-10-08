// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_SERVER_ENV } from './tests/e2e/support/env';

/**
 * End-to-end tests (T-QA-06). The app and its worker run together on their own port against the
 * test database, with the fake AI model (AI_FAKE) and a test-only sign-in, so the whole journey runs
 * without an AI provider, credit or real Interactor credentials. Playwright stops both processes.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/support/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 120_000,
  use: { baseURL: E2E_BASE_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The worker runs AI drafting, file reading and PDF jobs; it starts in the background and is
    // stopped with the web server (Playwright ends the whole process group).
    command: 'pnpm worker & exec pnpm dev',
    url: E2E_BASE_URL,
    env: E2E_SERVER_ENV,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
