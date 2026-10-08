// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOGO_MAX_BYTES, parseBranding, type AgencyActor } from '@easemuse/core';
import { closeDb, withAgency } from '@/lib/db';
import { adminClient, cleanup, createAgency, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { TINY_JPEG, TINY_PNG } from '@/test/images';
import { loadLogo, readBranding, removeLogo, setLogo, updateBranding } from './service';

describe.skipIf(!dbAvailable())('agency branding (T-13-06)', () => {
  let admin: pg.Client;
  let agencyA: string;
  let agencyB: string;
  let actorA: AgencyActor;

  const files = async (agencyId: string) =>
    (
      await admin.query('SELECT count(*)::int AS n FROM "FileObject" WHERE "agencyId" = $1', [
        agencyId,
      ])
    ).rows[0].n as number;
  const logs = async (action: string) =>
    (
      await admin.query(
        'SELECT data FROM "ActivityLog" WHERE "agencyId" = $1 AND action = $2 ORDER BY "createdAt"',
        [agencyA, action],
      )
    ).rows;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    agencyA = await createAgency(admin, 'Brand A');
    agencyB = await createAgency(admin, 'Brand B');
    actorA = { kind: 'agency', userId: randomUUID(), agencyId: agencyA, role: 'admin' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await closeDb();
  });

  it('starts with the agency name, the default colour and no logo', async () => {
    expect(await readBranding(actorA)).toEqual({
      agencyName: 'Brand A',
      displayName: null,
      primaryColor: '#1f2937',
      logoFileId: null,
    });
  });

  it('changes the display name and colour, clears the name again, and logs only the field names', async () => {
    const view = await updateBranding(actorA, {
      displayName: 'Acme Search',
      primaryColor: '#1d4ed8',
    });
    expect(view).toMatchObject({ displayName: 'Acme Search', primaryColor: '#1d4ed8' });
    expect(await updateBranding(actorA, { displayName: null })).toMatchObject({
      displayName: null,
      primaryColor: '#1d4ed8',
    });
    const rows = await logs('branding.updated');
    expect(rows.map((r) => r.data)).toEqual([
      { keys: ['displayName', 'primaryColor'] },
      { keys: ['displayName'] },
    ]);
  });

  it('stores a PNG logo, replaces it with a JPEG without leaving the old file behind, and removes it', async () => {
    const first = await setLogo(actorA, { bytes: TINY_PNG });
    expect(first.logoFileId).toBeTruthy();
    expect(await files(agencyA)).toBe(1);

    const second = await setLogo(actorA, { bytes: TINY_JPEG });
    expect(second.logoFileId).not.toBe(first.logoFileId);
    expect(await files(agencyA)).toBe(1);
    const blobs = await admin.query(
      'SELECT count(*)::int AS n FROM "FileBlob" WHERE "agencyId" = $1',
      [agencyA],
    );
    expect(blobs.rows[0].n).toBe(1);

    const logo = await withAgency(agencyA, async (tx) => {
      const row = await tx.agency.findUnique({
        where: { id: agencyA },
        select: { branding: true },
      });
      return loadLogo(tx, agencyA, parseBranding(row?.branding));
    });
    expect(logo).toMatchObject({ contentType: 'image/jpeg', fileId: second.logoFileId });
    expect([...logo!.bytes]).toEqual([...TINY_JPEG]);

    expect((await removeLogo(actorA)).logoFileId).toBeNull();
    expect(await files(agencyA)).toBe(0);
    expect((await logs('branding.logo_set')).length).toBe(2);
    expect((await logs('branding.logo_removed')).length).toBe(1);
  });

  it('refuses SVG, text, an oversize file and an image that is too many pixels wide', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    await expect(setLogo(actorA, { bytes: svg })).rejects.toMatchObject({ status: 415 });
    await expect(setLogo(actorA, { bytes: new Uint8Array(0) })).rejects.toMatchObject({
      status: 413,
    });
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(TINY_PNG);
    await expect(setLogo(actorA, { bytes: big })).rejects.toMatchObject({ status: 413 });
    const wide = Uint8Array.from(TINY_PNG);
    new DataView(wide.buffer).setUint32(16, 5000);
    await expect(setLogo(actorA, { bytes: wide })).rejects.toMatchObject({ status: 422 });
    expect(await files(agencyA)).toBe(0);
  });

  it("does not let another agency read or use this agency's logo (RLS)", async () => {
    const view = await setLogo(actorA, { bytes: TINY_PNG });
    const seenByB = await withAgency(agencyB, (tx) =>
      loadLogo(tx, agencyB, { primaryColor: '#1f2937', logoFileId: view.logoFileId! }),
    );
    expect(seenByB).toBeNull();
  });
});
