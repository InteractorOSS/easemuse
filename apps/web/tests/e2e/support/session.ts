// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import pg from 'pg';
import { E2E_AUTH_SECRET, E2E_BASE_URL, E2E_DATABASE_ADMIN_URL } from './env';

/**
 * Test-only sign-in (T-QA-06): the Interactor login cannot run in a test, so a user row is seeded in
 * the test database and the browser gets an Auth.js session cookie signed with the test secret.
 * Everything after the cookie (membership checks, roles, row-level security) is the real app.
 */
export interface TestUser {
  id: string;
  email: string;
  name: string;
}

export async function withAdmin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function seedUser(
  name: string,
  options: { platformRole?: 'owner' | 'admin' | 'support' } = {},
): Promise<TestUser> {
  const id = randomUUID();
  const email = `e2e-${id.slice(0, 8)}@example.com`;
  await withAdmin((c) =>
    c.query(
      `INSERT INTO "User" (id, "interactorSubject", email, name, "platformRole", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"PlatformRole", now())`,
      [id, `e2e-${id}`, email, name, options.platformRole ?? null],
    ),
  );
  return { id, email, name };
}

export async function signIn(context: BrowserContext, user: TestUser): Promise<void> {
  const value = await encode({
    token: { sub: user.id, userId: user.id, name: user.name, email: user.email, mfa: true },
    secret: E2E_AUTH_SECRET,
    salt: 'authjs.session-token',
  });
  await context.addCookies([
    { name: 'authjs.session-token', value, url: E2E_BASE_URL, httpOnly: true, sameSite: 'Lax' },
  ]);
}

/** Deletes the users a test created and every agency they belong to, with all agency rows. */
export async function removeTestData(users: TestUser[]): Promise<void> {
  const ids = users.map((u) => u.id);
  await withAdmin(async (c) => {
    const { rows } = await c.query<{ agencyId: string }>(
      `SELECT DISTINCT "agencyId" FROM "Membership" WHERE "userId" = ANY($1::uuid[])`,
      [ids],
    );
    const agencies = rows.map((r) => r.agencyId);
    await c.query('BEGIN');
    try {
      await c.query("SET LOCAL session_replication_role = 'replica'");
      if (agencies.length) {
        const tables = await c.query<{ table_name: string }>(
          `SELECT c.table_name FROM information_schema.columns c
           JOIN information_schema.tables t USING (table_schema, table_name)
           WHERE c.table_schema = 'public' AND c.column_name = 'agencyId' AND t.table_type = 'BASE TABLE'`,
        );
        for (const { table_name } of tables.rows) {
          await c.query(`DELETE FROM "${table_name}" WHERE "agencyId" = ANY($1::uuid[])`, [
            agencies,
          ]);
        }
        await c.query('DELETE FROM "Agency" WHERE id = ANY($1::uuid[])', [agencies]);
      }
      await c.query('DELETE FROM "PlatformAuditLog" WHERE "adminId" = ANY($1::uuid[])', [ids]);
      await c.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [ids]);
      await c.query('COMMIT');
    } catch (error) {
      await c.query('ROLLBACK');
      throw error;
    }
  });
}
