// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import { closeDb, withAgency } from '@/lib/db';
import { loadLogo, readBranding, removeLogo } from '@/server/branding/service';
import { decideSupportGrant, getSupportOverview } from '@/server/support/access';
import { getCompletedExportFile, listTenantExports } from '@/server/tenant/export';
import { adminClient, cleanup, createAgency, createUser, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { populateAgency } from '@/test/populate-agency';

/**
 * Isolation for the commercial and platform features (T-QA-01, TR-001, US-1301): acting as an ADMIN of
 * agency A, every service that takes an id answers "not found" when the id belongs to agency B, and
 * nothing of B changes. The role is admin on purpose, so a refusal can only come from isolation.
 */
describe.skipIf(!dbAvailable())('tenant isolation: branding, support access and exports', () => {
  let admin: pg.Client;
  let agencyA: string;
  let agencyB: string;
  let actorA: AgencyActor;
  let grantB: string;
  let exportB: string;
  let logoB: string;
  const users: string[] = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    agencyA = await createAgency(admin, 'IsoC A');
    agencyB = await createAgency(admin, 'IsoC B');
    const [a, b] = [await createUser(admin), await createUser(admin)];
    users.push(a, b);
    await populateAgency(admin, { agencyId: agencyA, userId: a });
    await populateAgency(admin, { agencyId: agencyB, userId: b });
    actorA = { kind: 'agency', userId: a, agencyId: agencyA, role: 'admin' };

    grantB = (
      await admin.query('SELECT id FROM "SupportAccessGrant" WHERE "agencyId" = $1', [agencyB])
    ).rows[0].id;
    exportB = (await admin.query('SELECT id FROM "TenantExport" WHERE "agencyId" = $1', [agencyB]))
      .rows[0].id;
    logoB = randomUUID();
    await admin.query(
      `INSERT INTO "FileObject" (id, "agencyId", store, filename, "contentType", "sizeBytes", sha256, "updatedAt")
       VALUES ($1, $2, 'db', 'logo.png', 'image/png', 1, 'x', now())`,
      [logoB, agencyB],
    );
    await admin.query(
      `INSERT INTO "FileBlob" (id, "agencyId", "fileId", bytes) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [agencyB, logoB, Buffer.from([1])],
    );
    await admin.query(
      `UPDATE "TenantExport" SET status = 'completed', "fileId" = $2 WHERE id = $1`,
      [exportB, logoB],
    );
    await admin.query(`UPDATE "Agency" SET branding = $2::jsonb WHERE id = $1`, [
      agencyB,
      JSON.stringify({ primaryColor: '#1f2937', logoFileId: logoB }),
    ]);
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB], users });
    await admin.end();
    await closeDb();
  });

  it("another agency's support grant can neither be seen nor decided", async () => {
    expect((await getSupportOverview(actorA)).grants.map((g) => g.id)).not.toContain(grantB);
    await expect(decideSupportGrant(actorA, grantB, { decision: 'approve' })).rejects.toMatchObject(
      {
        status: 404,
      },
    );
    await expect(decideSupportGrant(actorA, grantB, { decision: 'revoke' })).rejects.toMatchObject({
      status: 404,
    });
    const after = await admin.query(
      'SELECT "grantedById", "revokedAt" FROM "SupportAccessGrant" WHERE id = $1',
      [grantB],
    );
    expect(after.rows[0]).toEqual({ grantedById: null, revokedAt: null });
  });

  it("another agency's export is neither listed nor downloadable", async () => {
    expect((await listTenantExports(actorA)).map((e) => e.id)).not.toContain(exportB);
    await expect(
      withAgency(agencyA, (tx) => getCompletedExportFile(tx, actorA, exportB)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("another agency's logo is not readable, and A's branding never points at it", async () => {
    expect(
      await withAgency(agencyA, (tx) =>
        loadLogo(tx, agencyA, { primaryColor: '#1f2937', logoFileId: logoB }),
      ),
    ).toBeNull();
    expect((await readBranding(actorA)).logoFileId).toBeNull();
    // Removing A's (absent) logo does not touch B's file.
    await removeLogo(actorA);
    expect((await admin.query('SELECT 1 FROM "FileObject" WHERE id = $1', [logoB])).rowCount).toBe(
      1,
    );
  });
});
