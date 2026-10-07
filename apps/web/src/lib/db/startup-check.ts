// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * The runtime database role must not be able to bypass row-level security (ADR-001, T-F-08):
 * not a superuser, no BYPASSRLS, and not the owner of any table (owners are exempt from RLS unless
 * FORCE is set, and a superuser always is). Call at process start; throws on violation.
 */
export interface Queryable {
  query<R extends Record<string, unknown>>(sql: string): Promise<{ rows: R[] }>;
}

export class UnsafeDatabaseRoleError extends Error {
  constructor(public readonly reasons: string[]) {
    super(
      `Refusing to start: DATABASE_URL role can bypass row-level security (${reasons.join('; ')}). ` +
        'Connect as easemuse_app; migrations use DATABASE_ADMIN_URL.',
    );
    this.name = 'UnsafeDatabaseRoleError';
  }
}

interface RoleRow extends Record<string, unknown> {
  role: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  owns_tables: boolean;
}

export async function assertRuntimeRole(db: Queryable): Promise<{ role: string }> {
  const { rows } = await db.query<RoleRow>(`
    SELECT current_user AS role, r.rolsuper, r.rolbypassrls,
           EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owns_tables
    FROM pg_roles r WHERE r.rolname = current_user`);
  const row = rows[0];
  if (!row) throw new UnsafeDatabaseRoleError(['current role not found in pg_roles']);
  const reasons: string[] = [];
  if (row.rolsuper) reasons.push(`${row.role} is a superuser`);
  if (row.rolbypassrls) reasons.push(`${row.role} has BYPASSRLS`);
  if (row.owns_tables) reasons.push(`${row.role} owns tables`);
  if (reasons.length > 0) throw new UnsafeDatabaseRoleError(reasons);
  return { role: row.role };
}
