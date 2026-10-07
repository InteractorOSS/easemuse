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

/** Removes test agencies and users (tenant rows cascade from Agency / User). */
export async function cleanup(
  admin: pg.Client,
  ids: { agencies?: string[]; users?: string[] },
): Promise<void> {
  if (ids.agencies?.length) {
    await admin.query('DELETE FROM "Agency" WHERE id = ANY($1::uuid[])', [ids.agencies]);
  }
  if (ids.users?.length) {
    await admin.query('DELETE FROM "User" WHERE id = ANY($1::uuid[])', [ids.users]);
  }
}
