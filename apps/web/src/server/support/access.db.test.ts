// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor, PlatformAdminActor } from '@easemuse/core';
import { createAuthorizers } from '@/lib/auth/authorizers';
import { membershipLoader } from '@/lib/auth/membership';
import { closeDb, withAgency } from '@/lib/db';
import { adminClient, cleanup, createAgency, createUser, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import {
  decideSupportGrant,
  endSupportAccess,
  findActiveGrant,
  getSupportOverview,
  recordSupportView,
  requestSupportAccess,
} from './access';

const reason = 'The customer reported a missing report';

describe.skipIf(!dbAvailable())('support access (T-13-07, FR-ADM-07, FR-TEN-07)', () => {
  let admin: pg.Client;
  let agencyA: string;
  let agencyB: string;
  let slugA: string;
  let supportUser: string;
  let adminA: AgencyActor;
  let adminB: AgencyActor;
  let supporter: PlatformAdminActor;
  const users: string[] = [];

  const count = async (sql: string, args: unknown[]) =>
    (await admin.query(sql, args)).rows[0].n as number;
  const audit = (action: string) =>
    count(
      `SELECT count(*)::int AS n FROM "PlatformAuditLog" WHERE "agencyId" = $1 AND action = $2`,
      [agencyA, action],
    );
  const activity = (action: string) =>
    count(`SELECT count(*)::int AS n FROM "ActivityLog" WHERE "agencyId" = $1 AND action = $2`, [
      agencyA,
      action,
    ]);

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    agencyA = await createAgency(admin, 'Support A');
    agencyB = await createAgency(admin, 'Support B');
    slugA = (await admin.query('SELECT slug FROM "Agency" WHERE id = $1', [agencyA])).rows[0].slug;
    const [a, b, s] = [await createUser(admin), await createUser(admin), await createUser(admin)];
    users.push(a, b, s);
    supportUser = s;
    for (const [agencyId, userId] of [
      [agencyA, a],
      [agencyB, b],
    ]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'admin', true, now())`,
        [agencyId, userId],
      );
    }
    await admin.query(`UPDATE "User" SET "platformRole" = 'support' WHERE id = $1`, [s]);
    adminA = { kind: 'agency', userId: a, agencyId: agencyA, role: 'admin' };
    adminB = { kind: 'agency', userId: b, agencyId: agencyB, role: 'admin' };
    supporter = { kind: 'platform_admin', userId: s, role: 'support' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB], users });
    await admin.end();
    await closeDb();
  });

  /** The real authorizers over the real database, as the platform administrator, for a given method. */
  const authorizeAs = (method: string, path = '/api/v1/agencies/x/clients') =>
    createAuthorizers({
      getSession: async () => ({ userId: supportUser, mfa: true }),
      getUser: async (id) => ({
        id,
        email: 'support@x.test',
        name: null,
        locale: null,
        platformRole: 'support',
      }),
      getAgency: async (ref) =>
        ref === slugA ? { id: agencyA, slug: slugA, name: 'Support A', status: 'active' } : null,
      loadMembership: membershipLoader({ withAgency }),
      mfaEnforcement: () => 'off',
      log: () => undefined,
      loadSupportGrant: findActiveGrant,
      requestInfo: async () => ({ method, path }),
      recordSupportView,
    });

  let grantId: string;

  it('has no access before a request, and a request is pending, not access', async () => {
    expect(await authorizeAs('GET').authorizeAgency(slugA)).toMatchObject({ status: 404 });
    const view = await requestSupportAccess(supporter, agencyA, { reason, hours: 2 });
    grantId = view.id;
    expect(view).toMatchObject({ status: 'pending', requestedHours: 2 });
    expect(await authorizeAs('GET').authorizeAgency(slugA)).toMatchObject({ status: 404 });
    expect(await audit('support.request')).toBe(1);
    expect(await activity('support.requested')).toBe(1);
  });

  it('refuses a second open request from the same administrator', async () => {
    await expect(
      requestSupportAccess(supporter, agencyA, { reason, hours: 2 }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it("another agency's admin can neither see nor decide this grant (RLS)", async () => {
    await expect(
      decideSupportGrant(adminB, grantId, { decision: 'approve' }),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect((await getSupportOverview(adminB)).grants).toEqual([]);
    expect(await findActiveGrant(agencyB, supportUser)).toBeNull();
  });

  it('cannot revoke what is not active, and approving makes it active for exactly the requested hours', async () => {
    await expect(decideSupportGrant(adminA, grantId, { decision: 'revoke' })).rejects.toMatchObject(
      {
        status: 409,
      },
    );
    const now = new Date();
    const approved = await decideSupportGrant(adminA, grantId, { decision: 'approve' }, now);
    expect(approved.status).toBe('active');
    expect(approved.expiresAt!.getTime()).toBe(now.getTime() + 2 * 3_600_000);
    await expect(
      decideSupportGrant(adminA, grantId, { decision: 'approve' }),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(await activity('support.approved')).toBe(1);
  });

  it('lets the administrator read under the grant and logs every read in both logs', async () => {
    const before = {
      platform: await audit('support.view'),
      agency: await activity('support.view'),
    };
    const result = await authorizeAs('GET', '/a/acme/candidates').authorizeAgency(slugA);
    expect(result).toMatchObject({ role: 'lead', support: { id: grantId } });
    await authorizeAs('GET', '/api/v1/agencies/x/positions').authorizeAgency(slugA);
    expect(await audit('support.view')).toBe(before.platform + 2);
    expect(await activity('support.view')).toBe(before.agency + 2);
    const overview = await getSupportOverview(adminA);
    expect(overview.views.slice(0, 2).map((v) => v.path)).toEqual([
      '/api/v1/agencies/x/positions',
      '/a/acme/candidates',
    ]);
    expect(overview.views[0]).toMatchObject({ method: 'GET', adminEmail: expect.any(String) });
  });

  it('refuses writes under the grant, without logging a view', async () => {
    const before = await audit('support.view');
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      expect(await authorizeAs(method).authorizeAgency(slugA), method).toMatchObject({
        status: 403,
      });
    }
    expect(await audit('support.view')).toBe(before);
  });

  it('lets an agency admin revoke at any time, and then the administrator is out', async () => {
    await decideSupportGrant(adminA, grantId, { decision: 'revoke' });
    expect(await authorizeAs('GET').authorizeAgency(slugA)).toMatchObject({ status: 404 });
    expect(await activity('support.revoked')).toBe(1);
  });

  it('can be denied, ended early by the administrator, and expires on its own', async () => {
    const denied = await requestSupportAccess(supporter, agencyA, { reason, hours: 1 });
    expect((await decideSupportGrant(adminA, denied.id, { decision: 'deny' })).status).toBe(
      'denied',
    );
    expect(await findActiveGrant(agencyA, supportUser)).toBeNull();

    const second = await requestSupportAccess(supporter, agencyA, { reason, hours: 1 });
    await decideSupportGrant(adminA, second.id, { decision: 'approve' });
    expect(await findActiveGrant(agencyA, supportUser)).not.toBeNull();
    expect((await endSupportAccess(supporter, agencyA, second.id)).status).toBe('revoked');
    expect(await findActiveGrant(agencyA, supportUser)).toBeNull();
    expect(await audit('support.end')).toBe(1);

    const third = await requestSupportAccess(supporter, agencyA, { reason, hours: 1 });
    await decideSupportGrant(adminA, third.id, { decision: 'approve' });
    await admin.query(
      `UPDATE "SupportAccessGrant" SET "expiresAt" = now() - interval '1 minute' WHERE id = $1`,
      [third.id],
    );
    expect(await findActiveGrant(agencyA, supportUser)).toBeNull();
    expect(await authorizeAs('GET').authorizeAgency(slugA)).toMatchObject({ status: 404 });
  });

  it('keeps candidate and client content out of both logs', async () => {
    const rows = await admin.query(
      `SELECT data::text AS t FROM "PlatformAuditLog" WHERE "agencyId" = $1
       UNION ALL SELECT data::text FROM "ActivityLog" WHERE "agencyId" = $1 AND action LIKE 'support.%'`,
      [agencyA],
    );
    for (const { t } of rows.rows) expect(t ?? '').not.toContain(reason);
  });

  it('only the platform administrator who asked can end a grant', async () => {
    const other = await createUser(admin);
    users.push(other);
    const open = await requestSupportAccess(supporter, agencyA, { reason, hours: 1 });
    await expect(
      endSupportAccess({ kind: 'platform_admin', userId: other, role: 'admin' }, agencyA, open.id),
    ).rejects.toMatchObject({ status: 404 });
    await endSupportAccess(supporter, agencyA, open.id);
  });
});
