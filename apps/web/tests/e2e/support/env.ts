// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import os from 'node:os';

/**
 * The end-to-end environment (T-QA-06). Everything is local and disposable: its own database
 * (`easemuse_e2e`, dropped and rebuilt at the start of each run), its own Redis database number, its
 * own session secret, and the canned AI model. The web server and the worker are started by
 * playwright.config.ts with these values, so nothing here touches development data or a real key.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3190);
export const E2E_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DB = 'easemuse_e2e';
const user = encodeURIComponent(os.userInfo().username);
/** A superuser or database owner, to create the database and run migrations. */
export const E2E_ADMIN_URL =
  process.env.E2E_DATABASE_ADMIN_URL ?? `postgresql://${user}@localhost:5432/${E2E_DB}`;
export const E2E_POSTGRES_URL =
  process.env.E2E_POSTGRES_URL ?? `postgresql://${user}@localhost:5432/postgres`;
/** The runtime role the application connects as (never the owner, so row-level security applies). */
export const E2E_APP_URL = `postgresql://easemuse_app:easemuse_app@localhost:5432/${E2E_DB}`;
export const E2E_REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/9';
export const E2E_AUTH_SECRET = 'e2e-only-session-secret-not-used-anywhere-else-0123456789';

/** Fixed ids, so the tests can sign in without asking the database. */
export const IDS = {
  agency: '0e2e0000-0000-4000-8000-000000000001',
  user: '0e2e0000-0000-4000-8000-000000000002',
  client: '0e2e0000-0000-4000-8000-000000000003',
} as const;

export const SEED = {
  agencySlug: 'e2e-agency',
  agencyName: 'E2E Search',
  recruiterEmail: 'eve.recruiter@e2e.test',
  recruiterName: 'Eve Recruiter',
  recruiterSubject: 'e2e-recruiter',
  clientName: 'Northwind Corp',
  contactName: 'Hana Park',
  contactEmail: 'hana.park@northwind.test',
} as const;

/** Environment for the web server and the worker. */
export function serverEnv(): Record<string, string> {
  return {
    E2E_MODE: '1',
    NODE_ENV: 'development',
    PORT: String(E2E_PORT),
    APP_URL: E2E_URL,
    RENDER_BASE_URL: E2E_URL,
    DATABASE_URL: E2E_APP_URL,
    DATABASE_ADMIN_URL: E2E_ADMIN_URL,
    REDIS_URL: E2E_REDIS_URL,
    AUTH_SECRET: E2E_AUTH_SECRET,
    MFA_ENFORCEMENT: 'off',
    // No real keys: the AI is the canned model, mail stays in the outbox, files stay in the database.
    ANTHROPIC_API_KEY: '',
    SMTP_HOST: '',
    S3_BUCKET: '',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
