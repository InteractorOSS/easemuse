// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';
import { z } from 'zod';
import { e2eModeProblem } from './e2e-mode';

/**
 * Validated runtime configuration (T-F-04). Read through `getEnv()`; never touch `process.env`
 * directly in application code. Blank values count as unset. Secrets are optional in development
 * and test so the app boots without every integration, and required in production.
 */

const optionalString = z.string().min(1).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.url().default('http://localhost:3000'),
  /** Which process is running: sizes the DB pool and names its connections (T-F-05). */
  PROCESS_ROLE: z.enum(['web', 'worker']).default('web'),

  // Database: the runtime role (`easemuse_app`, no BYPASSRLS) and the owner role used by migrations.
  DATABASE_URL: z.string().min(1),
  DATABASE_ADMIN_URL: optionalString,
  /** The data-rights role (`easemuse_datarights`), used only by the anonymization job (ADR-016). */
  DATABASE_URL_DATARIGHTS: optionalString,
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(200).optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),

  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // Interactor services (ADR-002, ADR-014). Base URLs fall back in lib/interactor/service-urls.ts.
  ACCOUNT_SERVER_URL: z.url().optional(),
  BILLING_SERVER_URL: z.url().optional(),
  INTERACTOR_CORE_URL: z.url().optional(),
  INTERACTOR_USERDB_URL: z.url().optional(),
  UKB_URL: z.url().optional(),
  // The app's Account Server client: OIDC sign-in and client_credentials service tokens.
  INTERACTOR_AUTH_CLIENT_ID: optionalString,
  INTERACTOR_AUTH_CLIENT_SECRET: optionalString,
  /** Auth.js session secret (`openssl rand -base64 32`). */
  AUTH_SECRET: optionalString,
  /** Second-factor enforcement for agency users and platform admins (T-F-24, risk TR-011). */
  MFA_ENFORCEMENT: z.enum(['off', 'log', 'enforce']).default('log'),

  // AI (ADR-004/005, ADR-008).
  /** Fallback only: an owner can enter the key in the admin area, and that wins (server/platform/secrets.ts). */
  ANTHROPIC_API_KEY: optionalString,
  /** Optional: key material for secrets stored in the database. Defaults to AUTH_SECRET. */
  SECRETS_ENCRYPTION_KEY: optionalString,
  /** Fallback only: an owner can enter the Voyage key in the admin area, and that wins (server/platform/secrets.ts). */
  VOYAGE_API_KEY: optionalString,
  /**
   * The benchmark's web search step (ADR-005). `off` by default: the Anthropic account must have web
   * search switched on first (Claude Console, Privacy settings), and each search is billed.
   */
  WEB_SEARCH: z.enum(['on', 'off']).default('off'),

  // Object storage for generated files (ADR-011).
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,

  // PDF rendering (ADR-011): the worker opens the print route in headless Chromium.
  /** A Chromium or Chrome binary; defaults to the one Playwright installed. */
  CHROMIUM_PATH: optionalString,
  /** Where the worker reaches the web app for printing; defaults to APP_URL. */
  RENDER_BASE_URL: z.url().optional(),

  // Email transport (ADR-009). Without SMTP the dev-capture transport is used.
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: optionalString,
  // Connected mailboxes (T-5-12): the Interactor service ids for Gmail and Microsoft 365 as listed in
  // the service knowledge base, and the secret that signs Interactor's credential events.
  MAILBOX_GOOGLE_SERVICE_ID: optionalString,
  MAILBOX_MICROSOFT_SERVICE_ID: optionalString,
  INTERACTOR_WEBHOOK_SECRET: optionalString,

  // End-to-end tests only (T-QA-06): canned AI answers. Refused in production, see lib/e2e-mode.ts.
  E2E_MODE: z.enum(['1']).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Keys that must be present when NODE_ENV is production. */
const REQUIRED_IN_PRODUCTION = [
  'INTERACTOR_AUTH_CLIENT_ID',
  'INTERACTOR_AUTH_CLIENT_SECRET',
  'AUTH_SECRET',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'MAIL_FROM',
] as const satisfies readonly (keyof Env)[];

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

function dropBlank(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') out[key] = value;
  }
  return out;
}

/** Pure parser: validates `source` and throws `EnvError` listing every problem at once. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const e2e = e2eModeProblem({ ...source } as NodeJS.ProcessEnv);
  if (e2e) throw new EnvError([`E2E_MODE: ${e2e}`]);
  const result = envSchema.safeParse(dropBlank(source));
  if (!result.success) {
    throw new EnvError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const env = result.data;
  if (env.NODE_ENV === 'production') {
    const missing = REQUIRED_IN_PRODUCTION.filter((key) => env[key] === undefined);
    if (missing.length > 0) {
      throw new EnvError(missing.map((key) => `${key}: required in production`));
    }
  }
  return env;
}

/**
 * Local values live in `.env.local` (git-ignored), at the repo root or in apps/web. Next.js only
 * reads the app directory, so load the root file ourselves; real environment variables always win.
 */
function loadLocalEnvFiles(): void {
  for (const file of ['.env.local', '../../.env.local']) {
    try {
      // Development convenience only (skipped in production); keep it out of the server file trace.
      process.loadEnvFile(path.resolve(/* turbopackIgnore: true */ process.cwd(), file));
    } catch {
      /* file absent */
    }
  }
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    if (process.env.NODE_ENV !== 'production') loadLocalEnvFiles();
    cached = parseEnv(process.env);
  }
  return cached;
}

/** Test helper: forget the cached configuration. */
export function resetEnvForTests(): void {
  cached = undefined;
}
