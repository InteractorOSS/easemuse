// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, cleanup, createUser, dbAvailable } from '@/test/db';
import { grantPlatformRole } from './grant-role';

describe.skipIf(!dbAvailable())('grantPlatformRole', () => {
  let admin: pg.Client;
  let userId: string;
  const email = `grant-${Date.now()}@example.test`;

  beforeAll(async () => {
    admin = await adminClient();
    userId = await createUser(admin);
    await admin.query(`UPDATE "User" SET email = $1 WHERE id = $2`, [email, userId]);
  });
  afterAll(async () => {
    await admin.query(`DELETE FROM "PlatformAuditLog" WHERE "adminId" = $1`, [userId]);
    await cleanup(admin, { users: [userId] });
    await admin.end();
  });

  it('sets the role by email (any case) and records an audit entry', async () => {
    const result = await grantPlatformRole(admin, email.toUpperCase(), 'owner');
    expect(result).toMatchObject({ ok: true, userId, role: 'owner' });
    const row = (await admin.query(`SELECT "platformRole" FROM "User" WHERE id = $1`, [userId]))
      .rows[0];
    expect(row.platformRole).toBe('owner');
    const audit = (
      await admin.query(`SELECT action, data FROM "PlatformAuditLog" WHERE "adminId" = $1`, [
        userId,
      ])
    ).rows;
    expect(audit).toEqual([{ action: 'platform.role_set', data: { role: 'owner', via: 'cli' } }]);
  });

  it('removes access with "none"', async () => {
    expect(await grantPlatformRole(admin, email, 'none')).toMatchObject({ ok: true, role: null });
    const row = (await admin.query(`SELECT "platformRole" FROM "User" WHERE id = $1`, [userId]))
      .rows[0];
    expect(row.platformRole).toBeNull();
  });

  it('refuses an unknown role or a user who has never signed in, changing nothing', async () => {
    expect(await grantPlatformRole(admin, email, 'superuser')).toEqual({
      ok: false,
      reason: 'invalid_role',
    });
    expect(await grantPlatformRole(admin, 'nobody@example.test', 'owner')).toEqual({
      ok: false,
      reason: 'user_not_found',
    });
  });
});
