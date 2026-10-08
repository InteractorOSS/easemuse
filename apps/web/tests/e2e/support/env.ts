// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import os from 'node:os';

/**
 * The end-to-end environment. The app under test runs on its own port against the TEST database
 * and a separate Redis database, with the fake AI model and a test-only session secret, so a run
 * never touches development data, a real AI provider or real credentials.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

const user = encodeURIComponent(os.userInfo().username);
export const E2E_DATABASE_ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ?? `postgresql://${user}@localhost:5432/easemuse_test`;

/** Signs the session cookies the tests mint (Auth.js JWT sessions). Test-only; never a real secret. */
export const E2E_AUTH_SECRET =
  process.env.E2E_AUTH_SECRET ?? 'e2e-only-session-secret-not-for-any-real-environment';

export const E2E_SERVER_ENV: Record<string, string> = {
  PORT: String(E2E_PORT),
  APP_URL: E2E_BASE_URL,
  RENDER_BASE_URL: E2E_BASE_URL,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://easemuse_app:easemuse_app@localhost:5432/easemuse_test',
  DATABASE_ADMIN_URL: E2E_DATABASE_ADMIN_URL,
  DATABASE_URL_DATARIGHTS:
    process.env.TEST_DATARIGHTS_DATABASE_URL ??
    'postgresql://easemuse_datarights:easemuse_datarights@localhost:5432/easemuse_test',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/1',
  AUTH_SECRET: E2E_AUTH_SECRET,
  AI_FAKE: 'on',
  WEB_SEARCH: 'off',
  MFA_ENFORCEMENT: 'log',
};

for (const url of [E2E_SERVER_ENV.DATABASE_URL!, E2E_DATABASE_ADMIN_URL]) {
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error(`Refusing to run end-to-end tests against a database not named *_test: ${url}`);
  }
}
