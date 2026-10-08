// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, cleanup, createAgency, createUser, dbAvailable } from './db';
import { populateAgency } from './populate-agency';

describe.skipIf(!dbAvailable())('populateAgency (test helper)', () => {
  let admin: pg.Client;
  let agencyId: string;
  let userId: string;
  beforeAll(async () => {
    admin = await adminClient();
    agencyId = await createAgency(admin, 'Populate');
    userId = await createUser(admin);
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId], users: [userId] });
    await admin.end();
  });

  it('puts a row into every table that has an agencyId', async () => {
    const counts = await populateAgency(admin, { agencyId, userId });
    expect(Object.keys(counts).length).toBeGreaterThan(40);
    for (const table of Object.keys(counts)) {
      const rows = await admin.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "agencyId" = $1`,
        [agencyId],
      );
      expect(rows.rows[0].n, table).toBeGreaterThanOrEqual(1);
    }
  });
});
