// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';
import { createDbHandle, type DbHandle } from '@/lib/db/client';
import { createScope } from '@/lib/db/scoped';
import { TEST_DATABASE_ADMIN_URL, TEST_DATABASE_URL } from './db-env';

/** True when the test database is reachable (see global-setup). Use with `describe.skipIf(!dbAvailable)`. */
export const dbAvailable = (): boolean => inject('dbAvailable');

/** True when Redis is reachable; queue and realtime tests also need the database. */
export const redisAvailable = (): boolean => inject('redisAvailable');

/** Runtime-role handle (what production uses). Close it in `afterAll`. */
export function appHandle(poolSize = 5): DbHandle {
  return createDbHandle({ connectionString: TEST_DATABASE_URL, role: 'web', poolSize });
}

export function appScope(handle: DbHandle) {
  return createScope(() => handle);
}

/** Owner/superuser connection for seeding platform tables and cleaning up. */
export async function adminClient(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_ADMIN_URL });
  await client.connect();
  return client;
}

export async function createAgency(admin: pg.Client, name = 'Test Agency'): Promise<string> {
  const id = randomUUID();
  await admin.query(
    'INSERT INTO "Agency" (id, slug, name, "updatedAt") VALUES ($1, $2, $3, now())',
    [id, `t-${id}`, name],
  );
  return id;
}

export async function createUser(admin: pg.Client): Promise<string> {
  const id = randomUUID();
  await admin.query(
    'INSERT INTO "User" (id, "interactorSubject", email, "updatedAt") VALUES ($1, $2, $3, now())',
    [id, `sub-${id}`, `${id}@example.test`],
  );
  return id;
}

/**
 * Removes test agencies and users together with every row that belongs to them. Tenant deletion is
 * an explicit job in production (ADR-016), not a database cascade, so tests delete table by table
 * with foreign-key checks switched off for the cleanup transaction (needs the owner/superuser).
 */
export async function cleanup(
  admin: pg.Client,
  ids: { agencies?: string[]; users?: string[] },
): Promise<void> {
  await admin.query('BEGIN');
  try {
    await admin.query("SET LOCAL session_replication_role = 'replica'");
    if (ids.agencies?.length) {
      const { rows } = await admin.query<{ table_name: string }>(
        `SELECT c.table_name FROM information_schema.columns c
         JOIN information_schema.tables t USING (table_schema, table_name)
         WHERE c.table_schema = 'public' AND c.column_name = 'agencyId' AND t.table_type = 'BASE TABLE'`,
      );
      for (const { table_name } of rows) {
        await admin.query(`DELETE FROM "${table_name}" WHERE "agencyId" = ANY($1::uuid[])`, [
          ids.agencies,
        ]);
      }
      await admin.query('DELETE FROM "Agency" WHERE id = ANY($1::uuid[])', [ids.agencies]);
    }
    if (ids.users?.length) {
      await admin.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [ids.users]);
    }
    await admin.query('COMMIT');
  } catch (error) {
    await admin.query('ROLLBACK');
    throw error;
  }
}

/**
 * Serialises test files that depend on GLOBAL state (for example "how many platform owners exist"),
 * since vitest runs files in parallel against one database. Hold the lock for the whole file:
 * `beforeAll(() => acquireGlobalLock(admin, 'platform-roles'))`, `afterAll(() => releaseGlobalLock(...))`.
 */
const lockKey = (name: string) =>
  Array.from(name).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2_000_000_000, 7);
export async function acquireGlobalLock(admin: pg.Client, name: string): Promise<void> {
  await admin.query('SELECT pg_advisory_lock($1)', [lockKey(name)]);
}
export async function releaseGlobalLock(admin: pg.Client, name: string): Promise<void> {
  await admin.query('SELECT pg_advisory_unlock($1)', [lockKey(name)]);
}
