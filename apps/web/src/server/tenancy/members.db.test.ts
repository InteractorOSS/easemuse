// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { closeDb } from '@/lib/db';

const dispatch = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/server/messaging/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/messaging/outbox')>()),
  dispatchOutboxMessage: dispatch,
}));

import { acceptInvite } from './invites';
import {
  createInvite,
  listMembers,
  listPendingInvites,
  revokeInvite,
  updateMember,
} from './members';

describe.skipIf(!dbAvailable())('members and invitations', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let slugA: string;
  let boss: AgencyActor;
  let otherAgencyBoss: AgencyActor;
  const users: string[] = [];

  const newUser = async (email: string) => {
    const id = await createUser(admin);
    await admin.query(`UPDATE "User" SET email = $1, name = $2 WHERE id = $3`, [
      email,
      email.split('@')[0],
      id,
    ]);
    users.push(id);
    return { id, email };
  };
  const member = (
    agencyId: string,
    userId: string,
    role: 'admin' | 'lead' | 'recruiter',
    active = true,
  ) =>
    appScope(handle).withAgency(agencyId, (tx) =>
      tx.membership.create({ data: { agencyId, userId, role, active } }),
    );
  const tokenFromOutbox = async (agencyId: string, email: string) => {
    const row = (
      await admin.query(
        `SELECT "bodyText" FROM "OutboxMessage" WHERE "agencyId" = $1 AND "toAddress" = $2 ORDER BY "createdAt" DESC`,
        [agencyId, email],
      )
    ).rows[0];
    return /token=([\w-]+)/.exec(row.bodyText)![1]!;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Members A');
    agencyB = await createAgency(admin, 'Members B');
    slugA = `t-${agencyA}`;
    const bossUser = await newUser(`boss-${randomUUID()}@example.test`);
    const otherBoss = await newUser(`boss-${randomUUID()}@example.test`);
    await member(agencyA, bossUser.id, 'admin');
    await member(agencyB, otherBoss.id, 'admin');
    boss = { kind: 'agency', userId: bossUser.id, agencyId: agencyA, role: 'admin' };
    otherAgencyBoss = { kind: 'agency', userId: otherBoss.id, agencyId: agencyB, role: 'admin' };
  });

  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB], users });
    await admin.end();
    await handle.close();
    await closeDb();
  });

  it('lists members with their names, roles and keyset pages', async () => {
    const extra = [await newUser('r1@example.test'), await newUser('r2@example.test')];
    for (const u of extra) await member(agencyA, u.id, 'recruiter');
    const first = await listMembers(boss, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await listMembers(boss, { limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    expect(all.map((m) => m.role).sort()).toEqual(['admin', 'recruiter', 'recruiter']);
    expect(all.find((m) => m.email === 'r1@example.test')).toMatchObject({
      name: 'r1',
      active: true,
    });
  });

  it("never lists another agency's members", async () => {
    const result = await listMembers(otherAgencyBoss, { limit: 50 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.userId).toBe(otherAgencyBoss.userId);
  });

  it('changes a role, deactivates and reactivates, and logs it', async () => {
    const u = await newUser('change@example.test');
    await member(agencyA, u.id, 'recruiter');
    expect(await updateMember(boss, u.id, { role: 'lead' })).toMatchObject({
      role: 'lead',
      active: true,
    });
    expect(await updateMember(boss, u.id, { active: false })).toMatchObject({
      role: 'lead',
      active: false,
    });
    expect(await updateMember(boss, u.id, { active: true })).toMatchObject({ active: true });
    const log = await admin.query(
      `SELECT count(*)::int AS n FROM "ActivityLog" WHERE "agencyId" = $1 AND action = 'member.updated' AND "actorId" = $2`,
      [agencyA, boss.userId],
    );
    expect(log.rows[0].n).toBeGreaterThanOrEqual(3);
  });

  it('refuses to demote or deactivate the last active admin, but allows it when another remains', async () => {
    await expect(updateMember(boss, boss.userId, { role: 'recruiter' })).rejects.toMatchObject({
      status: 409,
      code: 'last_admin',
    });
    await expect(updateMember(boss, boss.userId, { active: false })).rejects.toMatchObject({
      code: 'last_admin',
    });
    const second = await newUser('second-admin@example.test');
    await member(agencyA, second.id, 'admin');
    expect(await updateMember(boss, second.id, { role: 'lead' })).toMatchObject({ role: 'lead' });
    await updateMember(boss, second.id, { role: 'admin' });
    expect(await updateMember(boss, boss.userId, { role: 'lead' })).toMatchObject({ role: 'lead' });
    await updateMember({ ...boss, userId: second.id }, boss.userId, { role: 'admin' }); // restore for later tests
  });

  it("cannot reach another agency's member (404)", async () => {
    await expect(
      updateMember(boss, otherAgencyBoss.userId, { role: 'recruiter' }),
    ).rejects.toMatchObject({ status: 404 });
    const unchanged = await listMembers(otherAgencyBoss, { limit: 5 });
    expect(unchanged.items[0]!.role).toBe('admin');
  });

  describe('invitations', () => {
    it('invites by email: hashed token, outbox email, activity log and dispatch', async () => {
      dispatch.mockClear();
      const invite = await createInvite(
        boss,
        { slug: slugA, name: 'Members A' },
        { email: 'new.hire@example.test', role: 'recruiter' },
      );
      expect(invite).toMatchObject({ email: 'new.hire@example.test', role: 'recruiter' });
      const stored = (
        await admin.query(`SELECT "tokenHash" FROM "MemberInvite" WHERE id = $1`, [invite.id])
      ).rows[0];
      const token = await tokenFromOutbox(agencyA, 'new.hire@example.test');
      expect(stored.tokenHash).not.toContain(token);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect((await listPendingInvites(boss)).map((i) => i.email)).toContain(
        'new.hire@example.test',
      );
    });

    it('is accepted end to end with the emailed link and then shows up as a member', async () => {
      const user = await newUser('hire2@example.test');
      await createInvite(
        boss,
        { slug: slugA, name: 'Members A' },
        { email: 'hire2@example.test', role: 'lead' },
      );
      const token = await tokenFromOutbox(agencyA, 'hire2@example.test');
      await acceptInvite({ agencySlug: slugA, token, user });
      expect(
        (await listMembers(boss, { limit: 50 })).items.find(
          (m) => m.email === 'hire2@example.test',
        ),
      ).toMatchObject({ role: 'lead', active: true });
      expect((await listPendingInvites(boss)).map((i) => i.email)).not.toContain(
        'hire2@example.test',
      );
    });

    it('refuses a duplicate pending invite (409) and inviting an active member (409)', async () => {
      await createInvite(
        boss,
        { slug: slugA, name: 'Members A' },
        { email: 'dup@example.test', role: 'recruiter' },
      );
      await expect(
        createInvite(
          boss,
          { slug: slugA, name: 'Members A' },
          { email: 'DUP@example.test', role: 'lead' },
        ),
      ).rejects.toMatchObject({ status: 409, code: 'invite_already_pending' });
      await expect(
        createInvite(
          boss,
          { slug: slugA, name: 'Members A' },
          { email: 'r1@example.test', role: 'lead' },
        ),
      ).rejects.toMatchObject({ status: 409, code: 'already_member' });
    });

    it('lets the same email be invited to a different agency', async () => {
      await createInvite(
        otherAgencyBoss,
        { slug: `t-${agencyB}`, name: 'Members B' },
        { email: 'dup@example.test', role: 'recruiter' },
      );
    });

    it('revokes an invite so its link stops working, and a second revoke is 404', async () => {
      const invite = await createInvite(
        boss,
        { slug: slugA, name: 'Members A' },
        { email: 'revoked@example.test', role: 'recruiter' },
      );
      const token = await tokenFromOutbox(agencyA, 'revoked@example.test');
      await revokeInvite(boss, invite.id);
      const user = await newUser('revoked@example.test');
      await expect(acceptInvite({ agencySlug: slugA, token, user })).rejects.toMatchObject({
        status: 404,
      });
      await expect(revokeInvite(boss, invite.id)).rejects.toMatchObject({ status: 404 });
      expect((await listPendingInvites(boss)).map((i) => i.id)).not.toContain(invite.id);
    });

    it("cannot revoke another agency's invite", async () => {
      const theirs = await createInvite(
        otherAgencyBoss,
        { slug: `t-${agencyB}`, name: 'Members B' },
        { email: 'theirs@example.test', role: 'recruiter' },
      );
      await expect(revokeInvite(boss, theirs.id)).rejects.toMatchObject({ status: 404 });
    });
  });
});
