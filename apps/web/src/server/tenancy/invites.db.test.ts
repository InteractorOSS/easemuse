// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomBytes } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { acceptInvite, hashToken } from './invites';
import { getMe } from './me';
import type { DbHandle } from '@/lib/db/client';

/**
 * These call the real services, which use the process-wide handle built from DATABASE_URL, so the
 * suite points that at the test database (never at your dev database).
 */
describe.skipIf(!dbAvailable())('invites and /me (pre-agency lookups)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let slugA: string;
  const users: string[] = [];

  async function newInvite(overrides: {
    email: string;
    expiresAt?: Date;
    revokedAt?: Date;
    acceptedAt?: Date;
    role?: 'admin' | 'lead' | 'recruiter';
    agencyId?: string;
  }) {
    const token = randomBytes(24).toString('hex');
    const agencyId = overrides.agencyId ?? agencyA;
    const inviter = users[0]!;
    await appScope(handle).withAgency(agencyId, (tx) =>
      tx.memberInvite.create({
        data: {
          agencyId,
          email: overrides.email,
          role: overrides.role ?? 'recruiter',
          tokenHash: hashToken(token),
          expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86_400_000),
          revokedAt: overrides.revokedAt ?? null,
          acceptedAt: overrides.acceptedAt ?? null,
          invitedById: inviter,
        },
      }),
    );
    return token;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = (await import('@/test/db-env')).TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'A');
    agencyB = await createAgency(admin, 'B');
    slugA = `t-${agencyA}`;
    users.push(await createUser(admin));
  });

  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB], users });
    await admin.end();
    await handle.close();
  });

  async function user(email: string) {
    const id = await createUser(admin);
    await admin.query('UPDATE "User" SET email = $1 WHERE id = $2', [email, id]);
    users.push(id);
    return { id, email };
  }

  it('accepts a valid invite, creates the membership, marks the invite used and logs it', async () => {
    const u = await user('new@example.test');
    const token = await newInvite({ email: 'New@Example.test', role: 'lead' });
    const result = await acceptInvite({ agencySlug: slugA, token, user: u });
    expect(result).toMatchObject({ agencyId: agencyA, role: 'lead' });

    const me = await getMe(u.id);
    expect(me.memberships).toEqual([{ agencyId: agencyA, slug: slugA, name: 'A', role: 'lead' }]);

    const log = await admin.query(
      `SELECT action FROM "ActivityLog" WHERE "agencyId" = $1 AND "actorId" = $2`,
      [agencyA, u.id],
    );
    expect(log.rows).toEqual([{ action: 'member.invite_accepted' }]);

    await expect(acceptInvite({ agencySlug: slugA, token, user: u })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('refuses expired (410), revoked (404), foreign-email (403) and unknown (404) tokens', async () => {
    const u = await user('who@example.test');
    const expired = await newInvite({ email: u.email, expiresAt: new Date(Date.now() - 1000) });
    const revoked = await newInvite({ email: u.email, revokedAt: new Date() });
    const foreign = await newInvite({ email: 'someone-else@example.test' });
    await expect(
      acceptInvite({ agencySlug: slugA, token: expired, user: u }),
    ).rejects.toMatchObject({ status: 410, code: 'invite_expired' });
    await expect(
      acceptInvite({ agencySlug: slugA, token: revoked, user: u }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      acceptInvite({ agencySlug: slugA, token: foreign, user: u }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      acceptInvite({ agencySlug: slugA, token: 'x'.repeat(32), user: u }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("does not honour agency A's token under agency B's slug", async () => {
    const u = await user('cross@example.test');
    const token = await newInvite({ email: u.email });
    await expect(
      acceptInvite({ agencySlug: `t-${agencyB}`, token, user: u }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await getMe(u.id)).memberships).toEqual([]);
  });

  it('reactivates a deactivated membership with the invited role', async () => {
    const u = await user('back@example.test');
    await appScope(handle).withAgency(agencyA, (tx) =>
      tx.membership.create({
        data: { agencyId: agencyA, userId: u.id, role: 'recruiter', active: false },
      }),
    );
    expect((await getMe(u.id)).memberships).toEqual([]);
    const token = await newInvite({ email: u.email, role: 'admin' });
    await acceptInvite({ agencySlug: slugA, token, user: u });
    expect((await getMe(u.id)).memberships[0]).toMatchObject({ role: 'admin' });
  });

  it("lists a user's memberships across agencies", async () => {
    const u = await user('multi@example.test');
    for (const agencyId of [agencyA, agencyB]) {
      const token = await newInvite({ email: u.email, agencyId });
      await acceptInvite({ agencySlug: `t-${agencyId}`, token, user: u });
    }
    const me = await getMe(u.id);
    expect(me.memberships.map((m) => m.agencyId).sort()).toEqual([agencyA, agencyB].sort());
  });
});
