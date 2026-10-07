// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { qualificationContentSchema, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, approveVersion } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { addCandidateToPosition } from '@/server/pipeline/service';
import { createPosition } from '@/server/positions/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import {
  createBlankQualification,
  getQualification,
  planCallQuestions,
  planQualification,
  scrubName,
} from './service';

describe('scrubName', () => {
  it('removes the whole name and its parts, whatever the case, but not words that merely contain them', () => {
    expect(
      scrubName('Jane Doe is keen. jane said Doe family is fine. Janet agrees.', 'Jane Doe'),
    ).toBe('the candidate is keen. the candidate said the candidate family is fine. Janet agrees.');
  });
});

describe.skipIf(!dbAvailable())('qualification (T-6-01, T-6-02)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);

  const entryAt = async (state: 'contacting' | 'screened') => {
    const position = await run((tx) =>
      createPosition(tx, rec, { clientId, title: 'Role', location: 'Seoul' }),
    );
    const c = await run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: agency,
          fullName: 'Jane Doe',
          source: 'linkedin',
          createdById: rec.userId,
        },
        select: { id: true },
      }),
    );
    const entry = await run((tx) =>
      addCandidateToPosition(tx, rec, position.id, { candidateId: c.id }),
    );
    await run((tx) => tx.pipelineEntry.update({ where: { id: entry.id }, data: { state } }));
    return entry;
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Qualify A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Q Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('waits until the candidate has been contacted', async () => {
    const e = await entryAt('screened');
    await expect(run((tx) => planCallQuestions(tx, rec, e.id))).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      run((tx) => planQualification(tx, rec, e.id, 'notes notes notes')),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('plans call questions without a reviewed analysis (no open points) and reuses the artifact', async () => {
    const e = await entryAt('contacting');
    const a = await run((tx) => planCallQuestions(tx, rec, e.id));
    const b = await run((tx) => planCallQuestions(tx, rec, e.id));
    expect(a.input.toConfirm).toEqual([]);
    expect(b.artifactId).toBe(a.artifactId);
  });

  it('sends the notes without the name', async () => {
    const e = await entryAt('contacting');
    const plan = await run((tx) =>
      planQualification(tx, rec, e.id, 'Jane Doe is keen, wants 180k'),
    );
    expect(plan.input.notes).toBe('the candidate is keen, wants 180k');
  });

  it('approving needs every filled field confirmed, then records the qualification', async () => {
    const e = await entryAt('contacting');
    const overview = await run((tx) => createBlankQualification(tx, rec, e.id));
    const draft = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: overview.qualification!.artifactId,
        content: qualificationContentSchema.parse({
          fields: { interest: { value: 'keen', level: 'high' } },
        }),
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await expect(run((tx) => approveVersion(tx, rec, draft.id))).rejects.toMatchObject({
      code: 'fields_unconfirmed',
    });
    const confirmed = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agency,
        artifactId: overview.qualification!.artifactId,
        content: qualificationContentSchema.parse({
          fields: { interest: { value: 'keen', level: 'high', confirmed: true } },
        }),
        origin: 'human',
        createdById: rec.userId,
      }),
    );
    await run((tx) => approveVersion(tx, rec, confirmed.id));
    const record = await admin.query(
      `SELECT "artifactId" FROM "QualificationRecord" WHERE "entryId" = $1`,
      [e.id],
    );
    expect(record.rows).toEqual([{ artifactId: overview.qualification!.artifactId }]);
    expect(
      (await run((tx) => getQualification(tx, rec, e.id))).qualification?.approvedVersionId,
    ).toBe(confirmed.id);
    void randomUUID;
  });
});
