// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { PlatformRole } from '@easemuse/core';
import { PLATFORM_ROLES } from '@easemuse/core';

/** The slice of a `pg` client this needs, so tests and the CLI can both pass one. */
export interface SqlClient {
  query(
    sql: string,
    params: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export type GrantResult =
  | { ok: true; userId: string; email: string; role: PlatformRole | null }
  | { ok: false; reason: 'invalid_role' | 'user_not_found' };

/**
 * Bootstraps platform access: sets (or clears, with `none`) `User.platformRole` for a user who has
 * signed in at least once. This is the only way to get the FIRST platform owner; afterwards owners
 * manage platform admins in /admin (T-ADM-03). It runs with the owner database role from the
 * command line and writes a platform audit entry attributed to the user themselves (no other admin exists yet).
 */
export async function grantPlatformRole(
  db: SqlClient,
  email: string,
  role: string,
): Promise<GrantResult> {
  const next =
    role === 'none'
      ? null
      : (PLATFORM_ROLES as readonly string[]).includes(role)
        ? (role as PlatformRole)
        : undefined;
  if (next === undefined) return { ok: false, reason: 'invalid_role' };

  const updated = await db.query(
    `UPDATE "User" SET "platformRole" = $1::"PlatformRole", "updatedAt" = now()
     WHERE lower(email) = lower($2) RETURNING id, email`,
    [next, email.trim()],
  );
  const row = updated.rows[0];
  if (!row) return { ok: false, reason: 'user_not_found' };

  await db.query(
    `INSERT INTO "PlatformAuditLog" (id, "adminId", action, "targetType", "targetId", data)
     VALUES (gen_random_uuid(), $1, 'platform.role_set', 'user', $1, $2::jsonb)`,
    [row.id, JSON.stringify({ role: next ?? 'none', via: 'cli' })],
  );
  return { ok: true, userId: String(row.id), email: String(row.email), role: next };
}
