// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/** Runs once when the Next.js server starts (see lib/db/boot-check.ts). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_DB_STARTUP_CHECK === 'true') return;
  const { checkRuntimeRoleOnBoot } = await import('@/lib/db/boot-check');
  await checkRuntimeRoleOnBoot();
}
