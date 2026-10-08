// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IMPORT_BATCH_SIZE, type AgencyActor } from '@easemuse/core';
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
import { importCandidateRows } from './import-csv';
import { searchCandidates } from './search';

describe.skipIf(!dbAvailable())('CSV candidate import (T-2-15)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let other: string;
  let rec: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Import A');
    other = await createAgency(admin, 'Import B');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency, other] });
    await admin.end();
    await handle.close();
  });

  it('creates active candidates with a human-approved profile, found by search and filters', async () => {
    const [outcome] = await run((tx) =>
      importCandidateRows(tx, rec, {
        source: 'referral',
        rows: [
          {
            fullName: 'Min Su Kim',
            email: 'Minsu@Example.com',
            phone: '+82 10 1111 2222',
            profileUrl: 'https://www.linkedin.com/in/minsu-kim',
            currentTitle: 'Senior HR Manager',
            currentCompany: 'Northwind Inc.',
            location: 'Seoul',
            skills: ['payroll', 'labour law'],
            yearsExperience: 11,
            tags: ['vip'],
            notes: 'Met at the HR summit',
          },
        ],
      }),
    );
    expect(outcome).toMatchObject({ index: 0, status: 'created' });
    const id = (outcome as { candidateId: string }).candidateId;
    const row = (await admin.query(`SELECT * FROM "Candidate" WHERE id = $1`, [id])).rows[0];
    expect(row).toMatchObject({
      status: 'active',
      source: 'referral',
      currentTitle: 'Senior HR Manager',
      location: 'Seoul',
      skills: ['payroll', 'labour law'],
      yearsExperience: 11,
      seniority: 'Manager',
      tags: ['vip'],
      doNotContact: false,
    });
    expect(row.profileArtifactId).not.toBeNull();
    const version = (
      await admin.query(
        `SELECT v.origin, v.status FROM "ArtifactVersion" v JOIN "Artifact" a ON a.id = v."artifactId" WHERE a."subjectId" = $1`,
        [id],
      )
    ).rows[0];
    expect(version).toEqual({ origin: 'human', status: 'approved' });
    const found = await run((tx) => searchCandidates(tx, { q: 'payroll' }, { limit: 10 }));
    expect(found.items.map((c) => c.id)).toContain(id);
    expect(
      (await admin.query(`SELECT body FROM "CandidateNote" WHERE "candidateId" = $1`, [id])).rows,
    ).toEqual([{ body: 'Met at the HR summit' }]);
  });

  it('skips a row that is already in the agency, in the file or from before, and says who', async () => {
    const outcomes = await run((tx) =>
      importCandidateRows(tx, rec, {
        source: 'database',
        rows: [
          { fullName: 'M. Kim', email: 'minsu@example.com', skills: [], tags: [] },
          { fullName: 'Pat Lee', phone: '010-9999-0000', skills: [], tags: [] },
          { fullName: 'Patricia Lee', phone: '+82 10 9999 0000', skills: [], tags: [] },
          { fullName: 'Same Link', profileUrl: 'linkedin.com/in/minsu-kim/', skills: [], tags: [] },
        ],
      }),
    );
    expect(outcomes.map((o) => o.status)).toEqual([
      'duplicate',
      'created',
      'duplicate',
      'duplicate',
    ]);
    expect(outcomes[0]).toMatchObject({ reasons: expect.arrayContaining(['email']) });
    const dup = outcomes[2] as { candidateId: string };
    const created = outcomes[1] as { candidateId: string };
    expect(dup.candidateId).toBe(created.candidateId);
  });

  it('keeps an address that opted out earlier as do-not-contact', async () => {
    await admin.query(
      `INSERT INTO "Suppression" (id, "agencyId", address, reason, "updatedAt") VALUES (gen_random_uuid(), $1, 'quiet@example.com', 'opted_out', now())`,
      [agency],
    );
    const [outcome] = await run((tx) =>
      importCandidateRows(tx, rec, {
        source: 'other',
        rows: [{ fullName: 'Quiet Person', email: 'quiet@example.com', skills: [], tags: [] }],
      }),
    );
    const id = (outcome as { candidateId: string }).candidateId;
    expect(
      (
        await admin.query(
          `SELECT "doNotContact", "doNotContactReason" FROM "Candidate" WHERE id = $1`,
          [id],
        )
      ).rows[0],
    ).toEqual({ doNotContact: true, doNotContactReason: 'Opted out of our email earlier' });
  });

  it('imports a full batch in time, and never touches another agency', async () => {
    const rows = Array.from({ length: IMPORT_BATCH_SIZE }, (_, i) => ({
      fullName: `Bulk Person ${i}`,
      email: `bulk${i}@example.com`,
      currentTitle: 'Engineer',
      currentCompany: `Company ${i}`,
      skills: ['go'],
      tags: [],
    }));
    const started = Date.now();
    const outcomes = await run((tx) => importCandidateRows(tx, rec, { source: 'database', rows }));
    const took = Date.now() - started;
    expect(outcomes.every((o) => o.status === 'created')).toBe(true);
    // The transaction limit is 15 s; a full batch should use well under half of it.
    expect(took).toBeLessThan(7000);
    const elsewhere = await admin.query(
      `SELECT count(*)::int AS n FROM "Candidate" WHERE "agencyId" = $1`,
      [other],
    );
    expect(elsewhere.rows[0].n).toBe(0);
  });
});
