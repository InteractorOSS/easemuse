// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Runs once when the Next.js server starts. Refuses to boot if the database role could bypass
 * row-level security (ADR-001). `ALLOW_PRIVILEGED_DB_ROLE=true` is a local-development escape
 * hatch and is ignored in production.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_DB_STARTUP_CHECK === 'true') return;

  const { assertRuntimeRole, getRuntimePool, UnsafeDatabaseRoleError } = await import('@/lib/db');

  try {
    await assertRuntimeRole(getRuntimePool());
  } catch (error) {
    const escape =
      process.env.ALLOW_PRIVILEGED_DB_ROLE === 'true' && process.env.NODE_ENV !== 'production';
    if (error instanceof UnsafeDatabaseRoleError) {
      if (escape) {
        console.warn(`[db] ${error.message} (continuing: ALLOW_PRIVILEGED_DB_ROLE)`);
        return;
      }
      throw error;
    }
    // Database unreachable at boot: report it, but let the dev server start.
    if (process.env.NODE_ENV === 'production') throw error;
    console.warn('[db] startup role check skipped:', (error as Error).message);
  }
}
