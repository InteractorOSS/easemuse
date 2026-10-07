// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlatformAdminActor } from '@easemuse/core';
import { closeDb } from '@/lib/db';
import {
  acquireGlobalLock,
  adminClient,
  cleanup,
  createUser,
  dbAvailable,
  releaseGlobalLock,
} from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { hashToken } from '@/server/tenancy/invites';
import {
  acceptPlatformAdminInvite,
  changePlatformAdminRole,
  invitePlatformAdmin,
  listPlatformAdmins,
  removePlatformAdmin,
  revokePlatformAdminInvite,
} from './admins';

describe.skipIf(!dbAvailable())('platform administrators (T-ADM-03)', () => {
  let admin: pg.Client;
  let saved: { id: string; platformRole: string }[] = [];
  const users: string[] = [];
  const emails: string[] = [];

  const mkUser = async (
    role: 'owner' | 'admin' | 'support' | null = null,
    email = `p-${randomUUID()}@example.test`,
  ) => {
    const id = await createUser(admin);
    users.push(id);
    await admin.query(
      `UPDATE "User" SET email = $1, "platformRole" = $2::"PlatformRole" WHERE id = $3`,
      [email, role, id],
    );
    emails.push(email);
    return {
      id,
      email,
      actor: { kind: 'platform_admin', userId: id, role: role ?? 'support' } as PlatformAdminActor,
    };
  };
  const roleOf = async (id: string) =>
    (await admin.query(`SELECT "platformRole" AS r FROM "User" WHERE id = $1`, [id])).rows[0].r as
      string | null;
  /** Earlier tests leave owners behind; the last-owner rules count them all. */
  const clearPlatformRoles = () =>
    admin.query(`UPDATE "User" SET "platformRole" = NULL WHERE "platformRole" IS NOT NULL`);
  const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    // These rules count ALL owners, so this file owns the platform roles while it runs.
    await acquireGlobalLock(admin, 'platform-roles');
    saved = (
      await admin.query(
        `SELECT id, "platformRole"::text AS "platformRole" FROM "User" WHERE "platformRole" IS NOT NULL`,
      )
    ).rows;
    await admin.query(`UPDATE "User" SET "platformRole" = NULL WHERE "platformRole" IS NOT NULL`);
  });
  afterAll(async () => {
    await admin.query(`DELETE FROM "PlatformAuditLog" WHERE "adminId" = ANY($1::uuid[])`, [users]);
    await admin.query(`DELETE FROM "PlatformAdminInvite" WHERE email = ANY($1::text[])`, [
      emails.map((e) => e.toLowerCase()),
    ]);
    await cleanup(admin, { users });
    for (const row of saved)
      await admin.query(`UPDATE "User" SET "platformRole" = $1::"PlatformRole" WHERE id = $2`, [
        row.platformRole,
        row.id,
      ]);
    await releaseGlobalLock(admin, 'platform-roles');
    await admin.end();
    await closeDb();
  });

  describe('invitations', () => {
    it('invites by email: stores only a hash, returns a one-time link and logs it without the token', async () => {
      const owner = await mkUser('owner');
      const { invite, acceptUrl } = await invitePlatformAdmin(owner.actor, {
        email: 'New.Admin@Example.test',
        role: 'support',
      });
      emails.push('new.admin@example.test');
      expect(invite).toMatchObject({ email: 'new.admin@example.test', role: 'support' });
      expect(acceptUrl).toMatch(/\/admin-invite\?token=[\w-]{20,}/);
      const row = (
        await admin.query(`SELECT "tokenHash" FROM "PlatformAdminInvite" WHERE id = $1`, [
          invite.id,
        ])
      ).rows[0];
      expect(row.tokenHash).toBe(hashToken(tokenOf(acceptUrl)));
      const audit = (
        await admin.query(`SELECT action, data FROM "PlatformAuditLog" WHERE "adminId" = $1`, [
          owner.id,
        ])
      ).rows;
      expect(audit).toContainEqual({ action: 'admin.invite', data: { role: 'support' } });
      expect(JSON.stringify(audit)).not.toContain(tokenOf(acceptUrl));
    });

    it('refuses duplicates and inviting someone who is already an administrator', async () => {
      const owner = await mkUser('owner');
      const existing = await mkUser('admin');
      await expect(
        invitePlatformAdmin(owner.actor, { email: existing.email, role: 'support' }),
      ).rejects.toMatchObject({ status: 409, code: 'already_admin' });
      const email = `dup-${randomUUID()}@example.test`;
      emails.push(email);
      await invitePlatformAdmin(owner.actor, { email, role: 'admin' });
      await expect(
        invitePlatformAdmin(owner.actor, { email: email.toUpperCase(), role: 'owner' }),
      ).rejects.toMatchObject({ status: 409, code: 'invite_already_pending' });
    });

    it('is accepted by the invited person: they get the role, once', async () => {
      const owner = await mkUser('owner');
      const person = await mkUser(null);
      const { acceptUrl } = await invitePlatformAdmin(owner.actor, {
        email: person.email,
        role: 'admin',
      });
      expect(await acceptPlatformAdminInvite({ token: tokenOf(acceptUrl), user: person })).toEqual({
        role: 'admin',
      });
      expect(await roleOf(person.id)).toBe('admin');
      await expect(
        acceptPlatformAdminInvite({ token: tokenOf(acceptUrl), user: person }),
      ).rejects.toMatchObject({ status: 409 });
      const audit = (
        await admin.query(`SELECT action FROM "PlatformAuditLog" WHERE "adminId" = $1`, [person.id])
      ).rows;
      expect(audit).toEqual([{ action: 'admin.accept' }]);
    });

    it('refuses the wrong person (403), an expired link (410) and a made-up token (404)', async () => {
      const owner = await mkUser('owner');
      const invited = await mkUser(null);
      const stranger = await mkUser(null);
      const { acceptUrl } = await invitePlatformAdmin(owner.actor, {
        email: invited.email,
        role: 'admin',
      });
      await expect(
        acceptPlatformAdminInvite({ token: tokenOf(acceptUrl), user: stranger }),
      ).rejects.toMatchObject({ status: 403 });
      expect(await roleOf(stranger.id)).toBeNull();
      await expect(
        acceptPlatformAdminInvite({
          token: tokenOf(acceptUrl),
          user: invited,
          now: new Date(Date.now() + 8 * 86_400_000),
        }),
      ).rejects.toMatchObject({ status: 410 });
      expect(await roleOf(invited.id)).toBeNull();
      await expect(
        acceptPlatformAdminInvite({ token: 'x'.repeat(40), user: invited }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lets an owner revoke a pending invitation, after which it cannot be used', async () => {
      const owner = await mkUser('owner');
      const person = await mkUser(null);
      const { invite, acceptUrl } = await invitePlatformAdmin(owner.actor, {
        email: person.email,
        role: 'admin',
      });
      await revokePlatformAdminInvite(owner.actor, invite.id);
      await expect(
        acceptPlatformAdminInvite({ token: tokenOf(acceptUrl), user: person }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(revokePlatformAdminInvite(owner.actor, invite.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('roles and removal', () => {
    it('lists administrators and pending invitations', async () => {
      const owner = await mkUser('owner');
      const email = `listed-${randomUUID()}@example.test`;
      emails.push(email);
      await invitePlatformAdmin(owner.actor, { email, role: 'support' });
      const { admins, invites } = await listPlatformAdmins(owner.actor);
      expect(admins.map((a) => a.userId)).toContain(owner.id);
      expect(admins.find((a) => a.userId === owner.id)).toMatchObject({
        role: 'owner',
        email: owner.email,
      });
      expect(invites.map((i) => i.email)).toContain(email);
    });

    it('changes a role and logs the change', async () => {
      const owner = await mkUser('owner');
      const other = await mkUser('support');
      expect(await changePlatformAdminRole(owner.actor, other.id, 'admin')).toMatchObject({
        role: 'admin',
      });
      expect(await roleOf(other.id)).toBe('admin');
      const audit = (
        await admin.query(
          `SELECT data FROM "PlatformAuditLog" WHERE "adminId" = $1 AND action = 'admin.role_change'`,
          [owner.id],
        )
      ).rows;
      expect(audit.map((r) => r.data)).toContainEqual({ from: 'support', to: 'admin' });
      await expect(
        changePlatformAdminRole(owner.actor, randomUUID(), 'admin'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('never leaves the platform without an owner (demote or remove the last one: 409)', async () => {
      await clearPlatformRoles();
      const [first, second] = [await mkUser('owner'), await mkUser('owner')];
      await removePlatformAdmin(first.actor, second.id); // fine: two owners
      expect(await roleOf(second.id)).toBeNull();
      await expect(changePlatformAdminRole(first.actor, first.id, 'admin')).rejects.toMatchObject({
        status: 409,
        code: 'last_owner',
      });
      await expect(removePlatformAdmin(first.actor, first.id)).rejects.toMatchObject({
        status: 409,
        code: 'last_owner',
      });
      expect(await roleOf(first.id)).toBe('owner');
      // Make the owner once more and demote the first: allowed while another owner remains.
      await admin.query(`UPDATE "User" SET "platformRole" = 'owner' WHERE id = $1`, [second.id]);
      expect(await changePlatformAdminRole(second.actor, first.id, 'support')).toMatchObject({
        role: 'support',
      });
      await admin.query(`UPDATE "User" SET "platformRole" = NULL WHERE id = ANY($1::uuid[])`, [
        [first.id, second.id],
      ]);
    });

    it('survives two owners demoting each other at the same moment: exactly one succeeds', async () => {
      await clearPlatformRoles();
      const [a, b] = [await mkUser('owner'), await mkUser('owner')];
      const results = await Promise.allSettled([
        changePlatformAdminRole(a.actor, b.id, 'support'),
        changePlatformAdminRole(b.actor, a.id, 'support'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: 'last_owner' });
      const owners = (
        await admin.query(
          `SELECT count(*)::int AS n FROM "User" WHERE "platformRole" = 'owner' AND id = ANY($1::uuid[])`,
          [[a.id, b.id]],
        )
      ).rows[0].n;
      expect(owners).toBe(1);
      await admin.query(`UPDATE "User" SET "platformRole" = NULL WHERE id = ANY($1::uuid[])`, [
        [a.id, b.id],
      ]);
    });

    it('removes access but keeps the account', async () => {
      const owner = await mkUser('owner');
      const other = await mkUser('support');
      await removePlatformAdmin(owner.actor, other.id);
      expect(await roleOf(other.id)).toBeNull();
      expect((await admin.query(`SELECT 1 FROM "User" WHERE id = $1`, [other.id])).rowCount).toBe(
        1,
      );
      await expect(removePlatformAdmin(owner.actor, other.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
