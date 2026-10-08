// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import { TEST_DATABASE_URL } from '@/test/db-env';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { disablePortalUser, invitePortalUser, redeemMagicLink, requestRelogin } from './identity';
import { emailPortalLink, portalEnterUrl } from './links';

describe.skipIf(!dbAvailable())('portal identity (ADR-002)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let a: string;
  let b: string;
  let slugA: string;
  let slugB: string;
  let lead: AgencyActor;
  let rec: AgencyActor;
  let contactId: string;
  let candidateId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(a, fn);
  const NOW = new Date('2026-10-07T09:00:00Z');
  const MIN = 60_000;

  beforeAll(async () => {
    // The services use the process-wide handle: point it at the TEST database.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(3);
    a = await createAgency(admin, 'Portal A');
    b = await createAgency(admin, 'Portal B');
    slugA = (await admin.query(`SELECT slug FROM "Agency" WHERE id = $1`, [a])).rows[0].slug;
    slugB = (await admin.query(`SELECT slug FROM "Agency" WHERE id = $1`, [b])).rows[0].slug;
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const [u, role] of [
      [u1, 'lead'],
      [u2, 'recruiter'],
    ] as const) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
        [a, u, role],
      );
    }
    lead = { kind: 'agency', userId: u1, agencyId: a, role: 'lead' };
    rec = { kind: 'agency', userId: u2, agencyId: a, role: 'recruiter' };
    const client = (await run((tx) => createClient(tx, lead, { name: 'Portal Client' }))).client;
    contactId = (
      await run((tx) =>
        tx.clientContact.create({
          data: { agencyId: a, clientId: client.id, name: 'Ms. Park', email: 'Park@Client.test' },
          select: { id: true },
        }),
      )
    ).id;
    candidateId = (
      await run((tx) =>
        tx.candidate.create({
          data: {
            agencyId: a,
            fullName: 'Jane Doe',
            email: 'jane@example.com',
            source: 'linkedin',
            createdById: u1,
          },
          select: { id: true },
        }),
      )
    ).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [a, b] });
    await admin.end();
    await handle.close();
  });

  it('invites a client contact with the email on file, storing only a hash of the token', async () => {
    const link = await run((tx) =>
      invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId: contactId }, NOW),
    );
    expect(link).toMatchObject({ audience: 'hiring_manager', email: 'park@client.test' });
    expect(link.expiresAt.getTime()).toBe(NOW.getTime() + 7 * 86_400_000);
    const rows = await admin.query(
      `SELECT "tokenHash" FROM "MagicLink" WHERE "portalUserId" = $1`,
      [link.portalUserId],
    );
    expect(rows.rows[0].tokenHash).not.toContain(link.token);
    expect(rows.rows[0].tokenHash).toHaveLength(64);
  });

  it('lets a lead or admin invite a hiring manager, not a recruiter; refuses a missing email and do-not-contact', async () => {
    await expect(
      run((tx) =>
        invitePortalUser(tx, rec, { audience: 'hiring_manager', clientContactId: contactId }, NOW),
      ),
    ).rejects.toMatchObject({ status: 403 });
    const clientId = (
      await run((tx) => tx.clientContact.findUniqueOrThrow({ where: { id: contactId } }))
    ).clientId;
    const noEmail = (
      await run((tx) =>
        tx.clientContact.create({
          data: { agencyId: a, clientId, name: 'No Mail' },
          select: { id: true },
        }),
      )
    ).id;
    await expect(
      run((tx) =>
        invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId: noEmail }, NOW),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const dnc = (
      await run((tx) =>
        tx.candidate.create({
          data: {
            agencyId: a,
            fullName: 'No Contact',
            email: 'dnc@example.com',
            source: 'linkedin',
            createdById: lead.userId,
            doNotContact: true,
          },
          select: { id: true },
        }),
      )
    ).id;
    await expect(
      run((tx) => invitePortalUser(tx, rec, { audience: 'candidate', candidateId: dnc }, NOW)),
    ).rejects.toMatchObject({ code: 'do_not_contact' });
  });

  it('redeems once; the second use, an expired link and a foreign agency all fail', async () => {
    const link = await run((tx) =>
      invitePortalUser(tx, rec, { audience: 'candidate', candidateId }, NOW),
    );
    const who = await redeemMagicLink({
      agencySlug: slugA,
      token: link.token,
      now: new Date(NOW.getTime() + MIN),
    });
    expect(who).toMatchObject({
      portalUserId: link.portalUserId,
      agencyId: a,
      audience: 'candidate',
    });
    await expect(
      redeemMagicLink({
        agencySlug: slugA,
        token: link.token,
        now: new Date(NOW.getTime() + 2 * MIN),
      }),
    ).rejects.toMatchObject({ status: 409 });
    const fresh = await run((tx) =>
      invitePortalUser(tx, rec, { audience: 'candidate', candidateId }, NOW),
    );
    await expect(
      redeemMagicLink({ agencySlug: slugB, token: fresh.token, now: NOW }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      redeemMagicLink({
        agencySlug: slugA,
        token: fresh.token,
        now: new Date(NOW.getTime() + 8 * 86_400_000),
      }),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      redeemMagicLink({ agencySlug: slugA, token: 'x'.repeat(43), now: NOW }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('two clicks at the same moment cannot both redeem', async () => {
    const link = await run((tx) =>
      invitePortalUser(tx, rec, { audience: 'candidate', candidateId }, NOW),
    );
    const results = await Promise.allSettled([
      redeemMagicLink({ agencySlug: slugA, token: link.token, now: NOW }),
      redeemMagicLink({ agencySlug: slugA, token: link.token, now: NOW }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('a disabled person cannot redeem or ask for a new link', async () => {
    const link = await run((tx) =>
      invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId: contactId }, NOW),
    );
    await run((tx) => disablePortalUser(tx, lead, link.portalUserId, NOW));
    await expect(
      redeemMagicLink({ agencySlug: slugA, token: link.token, now: NOW }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await requestRelogin({
        agencySlug: slugA,
        email: 'park@client.test',
        audience: 'hiring_manager',
        now: NOW,
      }),
    ).toBeNull();
    await expect(
      run((tx) => disablePortalUser(tx, rec, link.portalUserId, NOW)),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('a re-login link is short-lived, and an unknown email gets nothing back', async () => {
    await run((tx) =>
      invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId: contactId }, NOW),
    );
    const relogin = await requestRelogin({
      agencySlug: slugA,
      email: 'PARK@client.test',
      audience: 'hiring_manager',
      now: NOW,
    });
    expect(relogin!.expiresAt.getTime()).toBe(NOW.getTime() + 15 * MIN);
    expect(
      await requestRelogin({
        agencySlug: slugA,
        email: 'stranger@x.test',
        audience: 'hiring_manager',
        now: NOW,
      }),
    ).toBeNull();
    expect(
      await requestRelogin({
        agencySlug: slugA,
        email: 'park@client.test',
        audience: 'candidate',
        now: NOW,
      }),
    ).toBeNull();
    expect(
      await requestRelogin({
        agencySlug: slugB,
        email: 'park@client.test',
        audience: 'hiring_manager',
        now: NOW,
      }),
    ).toBeNull();
  });

  it('puts the token in the link fragment, and the email in the outbox', async () => {
    const link = await run((tx) =>
      invitePortalUser(tx, lead, { audience: 'hiring_manager', clientContactId: contactId }, NOW),
    );
    const url = portalEnterUrl('https://app.test/', slugA, 'hiring_manager', link.token);
    expect(url).toBe(`https://app.test/h/${slugA}/enter#token=${encodeURIComponent(link.token)}`);
    const sent = await run((tx) =>
      emailPortalLink(tx, {
        agency: { id: a, slug: slugA, name: 'Portal A' },
        senderId: lead.userId,
        link,
        kind: 'invite',
        baseUrl: 'https://app.test',
        agencyLocale: null,
      }),
    );
    const mail = await admin.query(
      `SELECT "toAddress", "bodyText", kind FROM "OutboxMessage" WHERE id = $1`,
      [sent.outboxMessageId],
    );
    expect(mail.rows[0]).toMatchObject({ toAddress: 'park@client.test', kind: 'portal_invite' });
    expect(mail.rows[0].bodyText).toContain('#token=');
    void vi;
  });
});
