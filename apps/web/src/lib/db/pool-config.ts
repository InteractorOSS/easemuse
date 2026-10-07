// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { PoolConfig } from 'pg';

export type ProcessRole = 'web' | 'worker';

/**
 * Default pool sizes per process role (T-F-05). The worker runs several jobs at once, each in its
 * own short `withAgency` transaction (ADR-001), so it gets a larger pool than the web process.
 * `DATABASE_POOL_SIZE` overrides the default for either role.
 */
export const DEFAULT_POOL_SIZE: Record<ProcessRole, number> = { web: 10, worker: 20 };

/** Prisma interactive-transaction bounds. Long work uses several short transactions, never one big one. */
export const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

export interface PoolInput {
  connectionString: string;
  role: ProcessRole;
  poolSize?: number | undefined;
  ssl?: boolean | undefined;
}

/** `application_name` stamped on every connection so `pg_stat_activity` shows whose it is. */
export function applicationName(role: ProcessRole): string {
  return `easemuse-${role}`;
}

export function resolvePoolConfig(input: PoolInput): PoolConfig {
  return {
    connectionString: input.connectionString,
    max: input.poolSize ?? DEFAULT_POOL_SIZE[input.role],
    // Fail fast when the pool is saturated instead of queueing requests forever.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: applicationName(input.role),
    ...(input.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}
