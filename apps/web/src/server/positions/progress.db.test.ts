// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor, PipelineState } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, approveVersion, createArtifact } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { addCandidateToPosition } from '@/server/pipeline/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { getPositionProgress } from './progress';
import { createPosition } from './service';

describe.skipIf(!dbAvailable())('position progress (G#10)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let lead: AgencyActor;
  let outsider: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);

  const newPosition = async () =>
    (await run((tx) => createPosition(tx, lead, { clientId, title: 'Role', location: 'Seoul' })))
      .id;
  const progressOf = (positionId: string) => run((tx) => getPositionProgress(tx, lead, positionId));
  /** A confirmed candidate in the position, moved straight to `state` (the moves are tested elsewhere). */
  const inState = async (positionId: string, state: PipelineState) => {
    const candidate = await run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: agencyA,
          fullName: `Cand ${randomUUID().slice(0, 6)}`,
          source: 'linkedin',
          createdById: lead.userId,
          status: 'active',
        },
        select: { id: true },
      }),
    );
    const entry = await run((tx) =>
      addCandidateToPosition(tx, lead, positionId, { candidateId: candidate.id }),
    );
    await run((tx) => tx.pipelineEntry.update({ where: { id: entry.id }, data: { state } }));
  };
  const successProfile = (positionId: string, approve: boolean) =>
    run(async (tx) => {
      const artifact = await createArtifact(tx, {
        agencyId: agencyA,
        kind: 'success_profile',
        subject: { type: 'position', id: positionId },
      });
      const v = await addDraftVersion(tx, {
        agencyId: agencyA,
        artifactId: artifact.id,
        content: {
          summary: 'Ideal candidate',
          criteria: [{ id: 'c1', text: '8 years in HR', category: 'must_have', basis: 'jd' }],
          expectations: { sixMonths: '', twelveMonths: '' },
          keyChallenges: [],
        },
        origin: 'human',
        createdById: lead.userId,
      });
      if (approve) await approveVersion(tx, lead, v.id);
    });

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Progress A');
    agencyB = await createAgency(admin, 'Progress B');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'lead', true, now())`,
      [agencyA, u1],
    );
    lead = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'lead' };
    outsider = { kind: 'agency', userId: u2, agencyId: agencyB, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, lead, { name: 'Progress Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('starts empty for a new position', async () => {
    const positionId = await newPosition();
    expect(await progressOf(positionId)).toEqual({
      jd: 'none',
      successProfile: 'none',
      pendingDrafts: 0,
      counts: { pipeline: 0, analyzed: 0, toAnalyze: 0, contacted: 0, interested: 0, submitted: 0 },
    });
  });

  it('tells a draft success profile from a confirmed one, and sees a structured JD', async () => {
    const draft = await newPosition();
    await successProfile(draft, false);
    await run((tx) =>
      createArtifact(tx, {
        agencyId: agencyA,
        kind: 'structured_jd',
        subject: { type: 'position', id: draft },
      }),
    );
    expect(await progressOf(draft)).toMatchObject({ jd: 'in_progress', successProfile: 'draft' });
    const confirmed = await newPosition();
    await successProfile(confirmed, true);
    expect((await progressOf(confirmed)).successProfile).toBe('confirmed');
  });

  it('counts the pipeline by how far each candidate got', async () => {
    const positionId = await newPosition();
    for (const state of [
      'sourced',
      'reviewed',
      'contacting',
      'interested',
      'qualified',
      'submitted',
      'interviewing',
      'rejected',
    ] as const) {
      await inState(positionId, state);
    }
    expect((await progressOf(positionId)).counts).toEqual({
      pipeline: 8,
      analyzed: 0,
      // The rejected candidate is out of the search, so only the other seven wait for an analysis.
      toAnalyze: 7,
      contacted: 5,
      interested: 2,
      submitted: 2,
    });
  });

  it('counts resumes uploaded for the position that wait for review', async () => {
    const positionId = await newPosition();
    await run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: agencyA,
          fullName: 'Draft: cv',
          source: 'linkedin',
          createdById: lead.userId,
          status: 'draft',
          intakePositionId: positionId,
        },
      }),
    );
    expect((await progressOf(positionId)).pendingDrafts).toBe(1);
  });

  it('is not visible from another agency', async () => {
    const positionId = await newPosition();
    await expect(
      appScope(handle).withAgency(agencyB, (tx) => getPositionProgress(tx, outsider, positionId)),
    ).rejects.toMatchObject({ status: 404 });
  });
});
