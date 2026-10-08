// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT, E2E_URL, serverEnv } from './tests/e2e/support/env';

// Build the private database before the servers start (the config is read again in each worker
// process, which inherits the flag, so this runs once per run).
if (!process.env.E2E_PREPARED) {
  execFileSync('pnpm', ['exec', 'tsx', 'tests/e2e/prepare.ts'], { stdio: 'inherit' });
  process.env.E2E_PREPARED = '1';
}

/**
 * End-to-end tests (T-QA-06, NFR-U01). They run against a private world: their own database, Redis
 * database, session secret, web server (port 3190, so a development server on 3000 is never reused
 * by mistake) and worker, with the canned AI model (`E2E_MODE=1`, impossible in production). Files in
 * `tests/e2e/*.spec.ts` run in order, one worker, because they share that world.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: E2E_URL,
    trace: 'retain-on-failure',
    screenshot: { mode: 'only-on-failure', fullPage: true },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm dev',
      url: `${E2E_URL}/api/auth/providers`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: serverEnv(),
      stdout: 'pipe',
      stderr: 'pipe',
      name: `web:${E2E_PORT}`,
    },
    {
      // The worker reads files, writes the AI profiles and prints PDFs for the web app.
      command: 'pnpm worker',
      wait: { stdout: /worker\.started/ },
      reuseExistingServer: false,
      timeout: 120_000,
      env: serverEnv(),
      stdout: 'pipe',
      stderr: 'pipe',
      name: 'worker',
    },
  ],
});
