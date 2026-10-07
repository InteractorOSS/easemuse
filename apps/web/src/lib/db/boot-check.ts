// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getDbHandle } from './client';
import { assertRuntimeRole, UnsafeDatabaseRoleError } from './startup-check';

/**
 * Process-start check shared by the web server (instrumentation.ts) and the worker: the runtime
 * database role must not be able to bypass row-level security (ADR-001). A violation always stops
 * boot, except in development with `ALLOW_PRIVILEGED_DB_ROLE=true` (ignored in production).
 * A database that is simply unreachable only stops boot in production.
 */
export async function checkRuntimeRoleOnBoot(): Promise<void> {
  try {
    await assertRuntimeRole(getDbHandle().pool);
  } catch (error) {
    const production = process.env.NODE_ENV === 'production';
    if (error instanceof UnsafeDatabaseRoleError) {
      if (process.env.ALLOW_PRIVILEGED_DB_ROLE === 'true' && !production) {
        console.warn(`[db] ${error.message} (continuing: ALLOW_PRIVILEGED_DB_ROLE)`);
        return;
      }
      throw error;
    }
    if (production) throw error;
    console.warn('[db] startup role check skipped:', (error as Error).message);
  }
}
