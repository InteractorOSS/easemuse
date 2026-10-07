// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlatformAdminActor } from '@easemuse/core';
import { adminClient, cleanup, createUser, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { closeDb } from '@/lib/db';

const dispatch = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/server/messaging/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/messaging/outbox')>()),
  dispatchOutboxMessage: dispatch,
}));

import { createAgencyWithAdmin, getAgencyDetail, listAgencies, setAgencyStatus } from './agencies';
import { hashToken } from './invites';

describe.skipIf(!dbAvailable())('platform agency management', () => {
  let admin: pg.Client;
  let actor: PlatformAdminActor;
  const prefix = `t${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  const created: string[] = [];
  const users: string[] = [];

  const make = async (n: string, email = `boss-${n}@example.test`) => {
    const slug = `${prefix}-${n}`;
    const result = await createAgencyWithAdmin(
      { name: `Agency ${n}`, slug, adminEmail: email, region: 'us' },
      actor,
      'Platform Admin',
    );
    created.push(result.agency.id);
    return result;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    const userId = await createUser(admin);
    users.push(userId);
    actor = { kind: 'platform_admin', userId, role: 'owner' };
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM "PlatformAuditLog" WHERE "adminId" = $1`, [actor.userId]);
    await cleanup(admin, { agencies: created, users });
    await admin.end();
    await closeDb();
  });

  it('creates the agency, its first admin invite, the invitation email and the audit entry together', async () => {
    dispatch.mockClear();
    const { agency, inviteExpiresAt } = await make('one', 'First.Admin@Example.test');
    expect(agency).toMatchObject({ slug: `${prefix}-one`, name: 'Agency one', status: 'active' });
    expect(inviteExpiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    const invite = (
      await admin.query(`SELECT * FROM "MemberInvite" WHERE "agencyId" = $1`, [agency.id])
    ).rows[0];
    expect(invite).toMatchObject({
      email: 'first.admin@example.test',
      role: 'admin',
      invitedById: actor.userId,
    });

    const mail = (
      await admin.query(`SELECT * FROM "OutboxMessage" WHERE "agencyId" = $1`, [agency.id])
    ).rows[0];
    expect(mail).toMatchObject({
      toAddress: 'first.admin@example.test',
      kind: 'member_invite',
      status: 'queued',
      transport: 'dev-capture',
    });
    const token = /token=([\w-]+)/.exec(mail.bodyText)![1]!;
    expect(hashToken(token)).toBe(invite.tokenHash);
    expect(mail.bodyText).toContain(`/invite/${prefix}-one?token=`);

    const audit = (
      await admin.query(`SELECT * FROM "PlatformAuditLog" WHERE "agencyId" = $1`, [agency.id])
    ).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'agency.create',
      adminId: actor.userId,
      targetType: 'agency',
    });

    expect(dispatch).toHaveBeenCalledWith({
      agencyId: agency.id,
      outboxMessageId: mail.id,
      requestedById: actor.userId,
    });
  });

  it('refuses a taken slug with 409 and leaves nothing behind', async () => {
    await make('dup');
    const before = (
      await admin.query(`SELECT count(*)::int AS n FROM "PlatformAuditLog" WHERE "adminId" = $1`, [
        actor.userId,
      ])
    ).rows[0].n;
    await expect(
      createAgencyWithAdmin(
        { name: 'Other', slug: `${prefix}-dup`, adminEmail: 'x@example.test', region: 'us' },
        actor,
        'A',
      ),
    ).rejects.toMatchObject({ status: 409, code: 'slug_taken' });
    const after = (
      await admin.query(`SELECT count(*)::int AS n FROM "PlatformAuditLog" WHERE "adminId" = $1`, [
        actor.userId,
      ])
    ).rows[0].n;
    expect(after).toBe(before);
  });

  it('lists agencies with search, status filter, member counts and keyset pages', async () => {
    for (const n of ['p1', 'p2', 'p3']) await make(n);
    const all = await listAgencies({ q: prefix, limit: 100 });
    expect(all.items.length).toBeGreaterThanOrEqual(5);
    expect(all.items.every((a) => a.slug.startsWith(prefix))).toBe(true);
    expect(all.items.every((a) => a.activeMembers === 0)).toBe(true);

    const page1 = await listAgencies({ q: `${prefix}-p`, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await listAgencies({ q: `${prefix}-p`, limit: 2, cursor: page1.nextCursor! });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((a) => a.id)).size).toBe(3);

    expect(
      (await listAgencies({ q: `${prefix}-p1`, status: 'suspended', limit: 10 })).items,
    ).toEqual([]);
    expect(
      (await listAgencies({ q: prefix.toUpperCase(), limit: 100 })).items.length,
    ).toBeGreaterThan(0);
  });

  it('shows detail with member and pending-invite counts, 404 when unknown', async () => {
    const { agency } = await make('detail');
    expect(await getAgencyDetail(agency.slug)).toMatchObject({
      id: agency.id,
      activeMembers: 0,
      pendingInvites: 1,
      region: 'us',
    });
    expect(await getAgencyDetail(agency.id)).toMatchObject({ slug: agency.slug });
    await expect(getAgencyDetail(randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(getAgencyDetail('no-such-agency-slug')).rejects.toMatchObject({ status: 404 });
  });

  it('suspends and reactivates with a reason in the audit log, and rejects repeats', async () => {
    const { agency } = await make('susp');
    expect((await setAgencyStatus(agency.id, 'suspended', 'Unpaid invoice', actor)).status).toBe(
      'suspended',
    );
    await expect(setAgencyStatus(agency.id, 'suspended', 'again', actor)).rejects.toMatchObject({
      status: 409,
    });
    expect((await setAgencyStatus(agency.id, 'active', 'Paid', actor)).status).toBe('active');
    await expect(setAgencyStatus(agency.id, 'active', 'again', actor)).rejects.toMatchObject({
      status: 409,
    });

    const audit = (
      await admin.query(
        `SELECT action, data FROM "PlatformAuditLog" WHERE "agencyId" = $1 ORDER BY "createdAt"`,
        [agency.id],
      )
    ).rows;
    expect(audit.map((r) => r.action)).toEqual([
      'agency.create',
      'agency.suspend',
      'agency.reactivate',
    ]);
    expect(audit[1].data).toMatchObject({ reason: 'Unpaid invoice', from: 'active' });
  });

  it('does not change a closed agency', async () => {
    const { agency } = await make('closed');
    await admin.query(`UPDATE "Agency" SET status = 'closed' WHERE id = $1`, [agency.id]);
    await expect(setAgencyStatus(agency.id, 'suspended', 'x', actor)).rejects.toMatchObject({
      status: 409,
    });
  });
});
