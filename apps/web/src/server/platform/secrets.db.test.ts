// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PlatformAdminActor } from '@easemuse/core';
import { resetEnvForTests } from '@/lib/env';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { adminClient, createUser, dbAvailable } from '@/test/db';
import {
  clearAnthropicKey,
  clearAnthropicKeyCache,
  getAnthropicKeyStatus,
  resolveAnthropicKey,
  setAnthropicKey,
} from './secrets';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123';

describe.skipIf(!dbAvailable())('Anthropic key in the admin area', () => {
  let admin: pg.Client;
  let owner: PlatformAdminActor;
  let support: PlatformAdminActor;
  let before: string | undefined;
  const users: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.AUTH_SECRET ??= 'secrets-db-test-auth-secret-0123456789';
    before = process.env.ANTHROPIC_API_KEY;
    admin = await adminClient();
    const [o, s] = [await createUser(admin), await createUser(admin)];
    users.push(o, s);
    owner = { kind: 'platform_admin', userId: o, role: 'owner' };
    support = { kind: 'platform_admin', userId: s, role: 'support' };
  });
  afterAll(async () => {
    await admin.query(`DELETE FROM "PlatformSecret"`);
    await admin
      .query(`DELETE FROM "PlatformAuditLog" WHERE "adminId" = ANY($1)`, [users])
      .catch(() => undefined);
    if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = before;
    resetEnvForTests();
    await admin.end();
  });
  beforeEach(async () => {
    await admin.query(`DELETE FROM "PlatformSecret"`);
    await admin.query(`DELETE FROM "PlatformAuditLog" WHERE "adminId" = ANY($1)`, [users]);
    // Blank, not deleted: a deleted variable would be filled in again from .env.local.
    process.env.ANTHROPIC_API_KEY = '';
    resetEnvForTests();
    clearAnthropicKeyCache();
  });

  it('stores the key encrypted, shows only the last four, and the AI client then uses it', async () => {
    const status = await setAnthropicKey(owner, KEY);
    expect(status).toMatchObject({
      configured: true,
      source: 'admin',
      last4: KEY.slice(-4),
      unreadable: false,
    });
    const row = await admin.query(
      `SELECT ciphertext, last4 FROM "PlatformSecret" WHERE name = 'anthropic_api_key'`,
    );
    expect(row.rows[0].ciphertext).not.toContain(KEY);
    expect(await resolveAnthropicKey()).toBe(KEY);
  });

  it('wins over the environment, and removing it falls back to the environment', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env-key-0123456789abcdefghij';
    resetEnvForTests();
    clearAnthropicKeyCache();
    expect((await getAnthropicKeyStatus(owner)).source).toBe('environment');
    await setAnthropicKey(owner, KEY);
    expect(await resolveAnthropicKey()).toBe(KEY);
    const cleared = await clearAnthropicKey(owner);
    expect(cleared.source).toBe('environment');
    expect(await resolveAnthropicKey()).toBe('sk-ant-env-key-0123456789abcdefghij');
  });

  it('with nothing set, there is no key', async () => {
    expect(await getAnthropicKeyStatus(owner)).toMatchObject({ configured: false, source: 'none' });
    expect(await resolveAnthropicKey()).toBeUndefined();
  });

  it('only an owner can change it; any platform admin can see the status', async () => {
    await expect(setAnthropicKey(support, KEY)).rejects.toMatchObject({ status: 403 });
    await expect(clearAnthropicKey(support)).rejects.toMatchObject({ status: 403 });
    await expect(setAnthropicKey(owner, 'not-a-key')).rejects.toMatchObject({ status: 422 });
    await setAnthropicKey(owner, KEY);
    expect((await getAnthropicKeyStatus(support)).last4).toBe(KEY.slice(-4));
  });

  it('logs that the key changed, never what it is', async () => {
    await setAnthropicKey(owner, KEY);
    await clearAnthropicKey(owner);
    const log = await admin.query(
      `SELECT action, data FROM "PlatformAuditLog" WHERE "adminId" = $1 ORDER BY "createdAt"`,
      [owner.userId],
    );
    expect(log.rows.map((r) => r.data.change)).toEqual(['set', 'cleared']);
    expect(JSON.stringify(log.rows)).not.toContain(KEY);
  });

  it('reports a stored key that can no longer be decrypted instead of failing', async () => {
    await admin.query(
      `INSERT INTO "PlatformSecret" (name, ciphertext, last4, "updatedById", "updatedAt") VALUES ('anthropic_api_key', 'v1.AAAA.BBBB.CCCC', 'wxyz', $1, now())`,
      [owner.userId],
    );
    expect(await getAnthropicKeyStatus(owner)).toMatchObject({
      configured: false,
      unreadable: true,
      source: 'admin',
    });
    expect(await resolveAnthropicKey()).toBeUndefined();
  });
});
