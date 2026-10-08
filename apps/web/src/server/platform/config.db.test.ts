// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor, PlatformAdminActor } from '@easemuse/core';
import { closeDb, withAgency } from '@/lib/db';
import { invitePortalUser } from '@/server/portal/identity';
import { sendTouchEmail } from '@/server/outreach/service';
import { createAgencyWithAdmin } from '@/server/tenancy/agencies';
import { adminClient, cleanup, createAgency, createUser, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import {
  getAgencyFeatures,
  getNewAgencyDefaultsView,
  getPlatformConfig,
  patchNewAgencyDefaults,
  setAgencyFeature,
} from './config';
import { assertFeature, isFeatureEnabled } from './features';

const guid = '11111111-1111-4111-8111-111111111111';

describe.skipIf(!dbAvailable())('platform configuration (T-16-02, FR-ADM-10)', () => {
  let admin: pg.Client;
  let agencyId: string;
  let otherId: string;
  let platform: PlatformAdminActor;
  let actor: AgencyActor;
  let contactId: string;
  const users: string[] = [];
  const createdAgencies: string[] = [];

  const count = async (table: string, action: string, id: string) =>
    (
      await admin.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "agencyId" = $1 AND action = $2`,
        [id, action],
      )
    ).rows[0].n as number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    agencyId = await createAgency(admin, 'Flags A');
    otherId = await createAgency(admin, 'Flags B');
    const [p, u] = [await createUser(admin), await createUser(admin)];
    users.push(p, u);
    await admin.query(`UPDATE "User" SET "platformRole" = 'admin' WHERE id = $1`, [p]);
    platform = { kind: 'platform_admin', userId: p, role: 'admin' };
    actor = { kind: 'agency', userId: u, agencyId, role: 'admin' };
    const client = await admin.query(
      `INSERT INTO "Client" (id, "agencyId", name, "updatedAt") VALUES (gen_random_uuid(), $1, 'C', now()) RETURNING id`,
      [agencyId],
    );
    contactId = (
      await admin.query(
        `INSERT INTO "ClientContact" (id, "agencyId", "clientId", name, email, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'Hana', 'hana@client.test', now()) RETURNING id`,
        [agencyId, client.rows[0].id],
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await admin.query(`DELETE FROM "PlatformConfig" WHERE key = 'new_agency_defaults'`);
    await cleanup(admin, { agencies: [agencyId, otherId, ...createdAgencies], users });
    await admin.end();
    await closeDb();
  });

  describe('routing table and prompt versions', () => {
    it('lists every purpose with its model, effort and prompt version, read only', () => {
      const config = getPlatformConfig();
      const jd = config.routing.find((r) => r.purpose === 'jd.structure')!;
      expect(jd).toMatchObject({ code: 'A1', model: 'claude-opus-5-5', effort: 'medium' });
      expect(jd.promptVersion).toMatch(/^jd-structure/);
      // A purpose whose prompt is not built yet shows no version rather than a wrong one.
      expect(config.routing.some((r) => r.promptVersion === null)).toBe(true);
      expect(config.flags.map((f) => f.key)).toEqual(['portals', 'email_sending']);
    });
  });

  describe('feature flags', () => {
    it('start on, switch off for one agency only, and are logged in both logs', async () => {
      expect((await getAgencyFeatures(agencyId)).flags).toEqual({
        portals: true,
        email_sending: true,
      });
      const off = await setAgencyFeature(platform, agencyId, { flag: 'portals', enabled: false });
      expect(off.flags).toEqual({ portals: false, email_sending: true });
      expect((await getAgencyFeatures(otherId)).flags.portals).toBe(true);
      expect(await isFeatureEnabled(agencyId, 'portals')).toBe(false);
      expect(await count('ActivityLog', 'feature.changed', agencyId)).toBe(1);
      const audit = await admin.query(
        `SELECT data FROM "PlatformAuditLog" WHERE "agencyId" = $1 AND action = 'config.feature'`,
        [agencyId],
      );
      expect(audit.rows[0].data).toEqual({ flag: 'portals', enabled: false });
    });

    it('stop portal invitations while off, and let them through when switched back on', async () => {
      await expect(
        withAgency(agencyId, (tx) =>
          invitePortalUser(tx, actor, { audience: 'hiring_manager', clientContactId: contactId }),
        ),
      ).rejects.toMatchObject({ status: 403, code: 'feature_disabled' });
      await setAgencyFeature(platform, agencyId, { flag: 'portals', enabled: true });
      const link = await withAgency(agencyId, (tx) =>
        invitePortalUser(tx, actor, { audience: 'hiring_manager', clientContactId: contactId }),
      );
      expect(link.email).toBe('hana@client.test');
    });

    it('stop sending email while off, before anything else is checked', async () => {
      await setAgencyFeature(platform, agencyId, { flag: 'email_sending', enabled: false });
      await expect(
        withAgency(agencyId, (tx) => sendTouchEmail(tx, actor, guid, 1, guid)),
      ).rejects.toMatchObject({ code: 'feature_disabled' });
      await setAgencyFeature(platform, agencyId, { flag: 'email_sending', enabled: true });
      await expect(
        withAgency(agencyId, (tx) => sendTouchEmail(tx, actor, guid, 1, guid)),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('ignore keys that are not flags', async () => {
      await admin.query(
        `UPDATE "Agency" SET "featureFlags" = '{"portals":false,"nonsense":false}' WHERE id = $1`,
        [otherId],
      );
      expect((await getAgencyFeatures(otherId)).flags).toEqual({
        portals: false,
        email_sending: true,
      });
      await expect(
        withAgency(otherId, (tx) => assertFeature(tx, otherId, 'portals')),
      ).rejects.toMatchObject({ code: 'feature_disabled' });
    });
  });

  describe('settings new agencies start from', () => {
    it('changes what the next agency gets and leaves existing agencies alone', async () => {
      const before = await withAgency(agencyId, (tx) =>
        tx.agency.findUnique({ where: { id: agencyId }, select: { settings: true } }),
      );
      const view = await patchNewAgencyDefaults(platform, {
        outreachIntervalsDays: [3, 5],
        rejectionReasons: ['Too senior', 'Too junior'],
        explainOnly: true,
      });
      expect(view).toMatchObject({ outreachIntervalsDays: [3, 5], explainOnly: true });
      expect((await getNewAgencyDefaultsView(platform)).rejectionReasons).toEqual([
        'Too senior',
        'Too junior',
      ]);

      const created = await createAgencyWithAdmin(
        {
          name: 'Defaults Test',
          slug: `defaults-${Date.now()}`,
          adminEmail: 'new@defaults.test',
          region: 'us',
        },
        platform,
        'Admin',
      );
      createdAgencies.push(created.agency.id);
      const row = await withAgency(created.agency.id, (tx) =>
        tx.agency.findUnique({ where: { id: created.agency.id }, select: { settings: true } }),
      );
      expect(row?.settings).toMatchObject({
        outreachIntervalsDays: [3, 5],
        rejectionReasons: ['Too senior', 'Too junior'],
        explainOnly: true,
      });
      const after = await withAgency(agencyId, (tx) =>
        tx.agency.findUnique({ where: { id: agencyId }, select: { settings: true } }),
      );
      expect(after?.settings).toEqual(before?.settings);
    });

    it('validates the whole like an agency does, and logs only the key names', async () => {
      await expect(
        patchNewAgencyDefaults(platform, {
          defaultMatchingWeights: {
            coreCompetencies: 90,
            relevantExperience: 20,
            industryFunctional: 15,
            careerLevel: 10,
            locationArrangement: 5,
            educationCertification: 5,
            compensationOther: 5,
          },
        }),
      ).rejects.toMatchObject({ status: 422 });
      const audit = await admin.query(
        `SELECT data FROM "PlatformAuditLog" WHERE action = 'config.new_agency_defaults' AND "adminId" = $1`,
        [platform.userId],
      );
      expect(JSON.stringify(audit.rows)).not.toContain('Too senior');
      expect(audit.rows[0].data.keys).toContain('outreachIntervalsDays');
    });
  });
});
