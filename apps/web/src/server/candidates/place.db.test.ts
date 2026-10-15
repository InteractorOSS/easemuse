// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { addDraftVersion, createArtifact } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
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
import { createCandidateDraft } from './intake';
import { listIntakeDrafts, placeConfirmedCandidate } from './place';

describe.skipIf(!dbAvailable())('upload for a position, confirm, analyze (G#9)', () => {
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
  const upload = (positionId?: string) =>
    run((tx) =>
      createCandidateDraft(
        tx,
        lead,
        { source: 'linkedin', ...(positionId ? { positionId } : {}) },
        {
          filename: `${randomUUID()}.pdf`,
          bytes: new TextEncoder().encode(`resume ${randomUUID()}`),
          kind: 'resume',
        },
      ),
    );
  /** What confirming does to the row; the confirmation itself is covered in confirm.db.test.ts. */
  const markConfirmed = (candidateId: string) =>
    run((tx) => tx.candidate.update({ where: { id: candidateId }, data: { status: 'active' } }));
  const approveSuccessProfile = (positionId: string) =>
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
      await tx.artifact.update({ where: { id: artifact.id }, data: { approvedVersionId: v.id } });
    });
  const close = (positionId: string) =>
    run((tx) => tx.position.update({ where: { id: positionId }, data: { status: 'cancelled' } }));

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Place A');
    agencyB = await createAgency(admin, 'Place B');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'lead', true, now())`,
      [agencyA, u1],
    );
    lead = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'lead' };
    outsider = { kind: 'agency', userId: u2, agencyId: agencyB, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, lead, { name: 'Place Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('keeps the position on the draft and lists it as waiting for review', async () => {
    const positionId = await newPosition();
    const draft = await upload(positionId);
    const row = await admin
      .query(`SELECT "intakePositionId", status FROM "Candidate" WHERE id = $1`, [
        draft.candidateId,
      ])
      .then((r) => r.rows[0]);
    expect(row).toEqual({ intakePositionId: positionId, status: 'draft' });
    const drafts = await run((tx) => listIntakeDrafts(tx, lead, positionId));
    expect(drafts.map((d) => [d.candidateId, d.state])).toEqual([[draft.candidateId, 'reading']]);
    // Nothing is in the position yet: only the recruiter's confirmation puts it there.
    expect(
      await run((tx) => tx.pipelineEntry.count({ where: { candidateId: draft.candidateId } })),
    ).toBe(0);
  });

  it('does not list drafts of other positions, confirmed ones, or plain uploads', async () => {
    const positionId = await newPosition();
    const other = await newPosition();
    const mine = await upload(positionId);
    const confirmed = await upload(positionId);
    await markConfirmed(confirmed.candidateId);
    await upload(other);
    await upload();
    const drafts = await run((tx) => listIntakeDrafts(tx, lead, positionId));
    expect(drafts.map((d) => d.candidateId)).toEqual([mine.candidateId]);
  });

  it('refuses an upload for a closed position, or one in another agency', async () => {
    const positionId = await newPosition();
    await close(positionId);
    await expect(upload(positionId)).rejects.toMatchObject({ status: 409 });
    const open = await newPosition();
    await expect(
      appScope(handle).withAgency(agencyB, (tx) => listIntakeDrafts(tx, outsider, open)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('adds the confirmed candidate to the position in "sourced", once', async () => {
    const positionId = await newPosition();
    const draft = await upload(positionId);
    await markConfirmed(draft.candidateId);
    const first = await run((tx) =>
      placeConfirmedCandidate(tx, lead, draft.candidateId, positionId),
    );
    expect(first).toMatchObject({ added: true, canAnalyze: false });
    const entry = await run((tx) =>
      tx.pipelineEntry.findUniqueOrThrow({ where: { id: first.entryId } }),
    );
    expect(entry).toMatchObject({ state: 'sourced', ownerId: lead.userId, positionId });
    // Already there (for example after merging into someone in the position): the same entry.
    const again = await run((tx) =>
      placeConfirmedCandidate(tx, lead, draft.candidateId, positionId),
    );
    expect(again).toEqual({ ...first, added: false });
  });

  it('says the analysis can run only when the success profile is confirmed', async () => {
    const positionId = await newPosition();
    await approveSuccessProfile(positionId);
    const draft = await upload(positionId);
    await markConfirmed(draft.candidateId);
    const placed = await run((tx) =>
      placeConfirmedCandidate(tx, lead, draft.candidateId, positionId),
    );
    expect(placed.canAnalyze).toBe(true);
  });

  it('refuses to place into a closed position with its own error code', async () => {
    const positionId = await newPosition();
    const draft = await upload(positionId);
    await markConfirmed(draft.candidateId);
    await close(positionId);
    await expect(
      run((tx) => placeConfirmedCandidate(tx, lead, draft.candidateId, positionId)),
    ).rejects.toMatchObject({ code: 'position_closed', status: 409 });
  });
});
