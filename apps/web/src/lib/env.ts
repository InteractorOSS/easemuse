// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import path from 'node:path';
import { z } from 'zod';

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
  ANTHROPIC_API_KEY: optionalString,
  VOYAGE_API_KEY: optionalString,

  // Object storage for generated files (ADR-011).
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,

  // Email transport (ADR-009). Without SMTP the dev-capture transport is used.
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: optionalString,
});

export type Env = z.infer<typeof envSchema>;

/** Keys that must be present when NODE_ENV is production. */
const REQUIRED_IN_PRODUCTION = [
  'INTERACTOR_AUTH_CLIENT_ID',
  'INTERACTOR_AUTH_CLIENT_SECRET',
  'AUTH_SECRET',
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
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
      process.loadEnvFile(path.resolve(process.cwd(), file));
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
