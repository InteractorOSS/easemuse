// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import { closeDb } from '@/lib/db';
import { setLogo } from '@/server/branding/service';
import { adminClient, cleanup, createAgency, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { TINY_PNG } from '@/test/images';
import { GET } from './[agencySlug]/logo/route';

describe.skipIf(!dbAvailable())('GET /api/public/agencies/:slug/logo (T-14-06)', () => {
  let admin: pg.Client;
  let withLogo: string;
  let without: string;
  const slugOf = async (id: string) =>
    (await admin.query('SELECT slug FROM "Agency" WHERE id = $1', [id])).rows[0].slug as string;
  const call = async (slug: string, headers: Record<string, string> = {}) =>
    GET(new Request('http://x.test/', { headers }), {
      params: Promise.resolve({ agencySlug: slug }),
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    withLogo = await createAgency(admin, 'Logo A');
    without = await createAgency(admin, 'Logo B');
    const actor: AgencyActor = {
      kind: 'agency',
      userId: randomUUID(),
      agencyId: withLogo,
      role: 'admin',
    };
    await setLogo(actor, { bytes: TINY_PNG });
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [withLogo, without] });
    await admin.end();
    await closeDb();
  });

  it('serves the logo with its type, a cache validator and no sniffing', async () => {
    const response = await call(await slugOf(withLogo));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...TINY_PNG]);
    const etag = response.headers.get('etag')!;
    expect((await call(await slugOf(withLogo), { 'if-none-match': etag })).status).toBe(304);
  });

  it('is a 404 for an agency without a logo, an unknown agency and a closed agency', async () => {
    expect((await call(await slugOf(without))).status).toBe(404);
    expect((await call('no-such-agency')).status).toBe(404);
    await admin.query(`UPDATE "Agency" SET status = 'closed' WHERE id = $1`, [withLogo]);
    expect((await call(await slugOf(withLogo))).status).toBe(404);
  });
});
