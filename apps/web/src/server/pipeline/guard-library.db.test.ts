// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor, GuardKey, PipelineState } from '@easemuse/core';
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
import { approveJdForSourcing } from '@/test/jd-fixtures';
import { addCandidateToPosition, transitionEntry } from './service';

describe.skipIf(!dbAvailable())('pipeline guards (T-3-02)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let actor: AgencyActor;
  let clientA: string;
  let clientB: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);
  const setModes = (modes: Partial<Record<GuardKey, 'block' | 'warn'>>) =>
    admin.query(
      `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{guardModes}', $2::jsonb) WHERE id = $1`,
      [
        agencyId,
        JSON.stringify({
          jdApproval: 'block',
          resumeApproval: 'block',
          consent: 'block',
          recruiterAssessment: 'block',
          ...modes,
        }),
      ],
    );

  /** An entry that is one step before `to`, in a position of the given client. */
  const entryAt = async (
    state: PipelineState,
    client = clientA,
    positionStatus: 'draft' | 'sourcing' = 'sourcing',
  ) => {
    const positionId = (
      await run((tx) =>
        createPosition(tx, actor, { clientId: client, title: 'Role', location: 'Seoul' }),
      )
    ).id;
    await run((tx) =>
      tx.position.update({ where: { id: positionId }, data: { status: positionStatus } }),
    );
    const candidateId = (
      await run((tx) =>
        tx.candidate.create({
          data: {
            agencyId,
            fullName: 'Guard Gina',
            source: 'linkedin',
            createdById: actor.userId,
            status: 'active',
          },
          select: { id: true },
        }),
      )
    ).id;
    const entry = await run((tx) => addCandidateToPosition(tx, actor, positionId, { candidateId }));
    await run((tx) => tx.pipelineEntry.update({ where: { id: entry.id }, data: { state } }));
    return { ...entry, positionId, candidateId };
  };
  const submit = (entryId: string, overrides: { guard: GuardKey; reason: string }[] = []) =>
    run((tx) =>
      transitionEntry(tx, actor, entryId, {
        to: 'submitted',
        ...(overrides.length ? { overrideGuards: overrides } : {}),
      }),
    );
  const guardsOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return [] as string[];
    } catch (error) {
      return ((error as { guards?: { guard: string }[] }).guards ?? []).map((g) => g.guard).sort();
    }
  };
  const giveConsent = (
    candidateId: string,
    clientId: string,
    action: 'given' | 'withdrawn',
    at: Date,
  ) =>
    run((tx) =>
      tx.consent.create({
        data: {
          agencyId,
          candidateId,
          clientId,
          action,
          at,
          source: 'recorded_by_recruiter',
          method: 'phone',
        },
      }),
    );
  const approveResume = (
    entryId: string,
    decision: 'approved' | 'changes_requested' = 'approved',
  ) =>
    run(async (tx) => {
      const approval = await tx.approval.create({
        data: {
          agencyId,
          subject: 'tailored_resume',
          subjectId: entryId,
          versionId: randomUUID(),
          decision,
          source: 'recorded_by_recruiter',
          approverName: 'Gina',
          decidedAt: new Date(),
        },
      });
      await tx.tailoredResume.create({
        data: { agencyId, entryId, artifactId: randomUUID(), approvalId: approval.id },
      });
    });
  const approveReport = async (entryId: string, assessment: string | null) => {
    const artifact = await run((tx) =>
      createArtifact(tx, {
        agencyId,
        kind: 'submission_report',
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    const version = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content: assessment === null ? {} : { recruiterAssessment: assessment },
        origin: 'human',
        createdById: actor.userId,
      }),
    );
    await admin.query(`UPDATE "ArtifactVersion" SET status = 'approved' WHERE id = $1`, [
      version.id,
    ]);
    await admin.query(`UPDATE "Artifact" SET "approvedVersionId" = $2 WHERE id = $1`, [
      artifact.id,
      version.id,
    ]);
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Guards A');
    const userId = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'lead', true, now())`,
      [agencyId, userId],
    );
    actor = { kind: 'agency', userId, agencyId, role: 'lead' };
    clientA = (await run((tx) => createClient(tx, actor, { name: 'Guard Client A' }))).client.id;
    clientB = (await run((tx) => createClient(tx, actor, { name: 'Guard Client B' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  it('names every missing record at once when submitting with nothing on file', async () => {
    const e = await entryAt('candidate_approved');
    expect(await guardsOf(submit(e.id))).toEqual([
      'consent',
      'recruiterAssessment',
      'resumeApproval',
    ]);
    expect(
      (await run((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: e.id } }))).state,
    ).toBe('candidate_approved');
  });

  it('lets a submission through once the resume approval, consent and assessment are on file', async () => {
    const e = await entryAt('candidate_approved');
    await approveResume(e.id);
    await giveConsent(e.candidateId, clientA, 'given', new Date());
    await approveReport(e.id, 'Strong fit for the role.');
    expect((await submit(e.id)).state).toBe('submitted');
  });

  describe('resume approval (FR-RES-03)', () => {
    it('is not met by a resume the candidate asked to change, or by none', async () => {
      const e = await entryAt('candidate_approved');
      await giveConsent(e.candidateId, clientA, 'given', new Date());
      await approveReport(e.id, 'ok');
      expect(await guardsOf(submit(e.id))).toEqual(['resumeApproval']);
      await approveResume(e.id, 'changes_requested');
      expect(await guardsOf(submit(e.id))).toEqual(['resumeApproval']);
      await approveResume(e.id, 'approved'); // a newer resume, approved
      expect(await guardsOf(submit(e.id))).toEqual([]);
    });
  });

  describe('consent per client (FR-CDP-03)', () => {
    it('is for this client only: consent for another client does not count', async () => {
      const e = await entryAt('candidate_approved', clientA);
      await approveResume(e.id);
      await approveReport(e.id, 'ok');
      await giveConsent(e.candidateId, clientB, 'given', new Date());
      expect(await guardsOf(submit(e.id))).toEqual(['consent']);
    });

    it('is cancelled by a later withdrawal, and restored by a later "given"', async () => {
      const e = await entryAt('candidate_approved', clientA);
      await approveResume(e.id);
      await approveReport(e.id, 'ok');
      await giveConsent(e.candidateId, clientA, 'given', new Date(Date.now() - 3000));
      await giveConsent(e.candidateId, clientA, 'withdrawn', new Date(Date.now() - 2000));
      expect(await guardsOf(submit(e.id))).toEqual(['consent']);
      await giveConsent(e.candidateId, clientA, 'given', new Date(Date.now() - 1000));
      expect(await guardsOf(submit(e.id))).toEqual([]);
    });

    it('is not met by a general consent that names no client', async () => {
      const e = await entryAt('candidate_approved', clientA);
      await approveResume(e.id);
      await approveReport(e.id, 'ok');
      await run((tx) =>
        tx.consent.create({
          data: {
            agencyId,
            candidateId: e.candidateId,
            clientId: null,
            action: 'given',
            at: new Date(),
            source: 'portal',
          },
        }),
      );
      expect(await guardsOf(submit(e.id))).toEqual(['consent']);
    });
  });

  describe("recruiter's assessment (brief 10, section 14)", () => {
    it('needs an approved report with the assessment written; a blank one or none is not enough', async () => {
      const e = await entryAt('candidate_approved');
      await approveResume(e.id);
      await giveConsent(e.candidateId, clientA, 'given', new Date());
      expect(await guardsOf(submit(e.id))).toEqual(['recruiterAssessment']);
      await approveReport(e.id, '   ');
      expect(await guardsOf(submit(e.id))).toEqual(['recruiterAssessment']);
    });
  });

  describe('JD approval before working a candidate (US-106)', () => {
    it('blocks contacting while the position is still being prepared and the JD is not approved', async () => {
      const e = await entryAt('screened', clientA, 'draft');
      expect(
        await guardsOf(run((tx) => transitionEntry(tx, actor, e.id, { to: 'contacting' }))),
      ).toEqual(['jdApproval']);
    });

    it('lets contacting through once the JD is approved, or the position has moved on', async () => {
      const prepared = await entryAt('screened', clientA, 'draft');
      await approveJdForSourcing(run, actor, prepared.positionId);
      expect(
        (await run((tx) => transitionEntry(tx, actor, prepared.id, { to: 'contacting' }))).state,
      ).toBe('contacting');
      const sourcing = await entryAt('screened', clientA, 'sourcing');
      expect(
        (await run((tx) => transitionEntry(tx, actor, sourcing.id, { to: 'contacting' }))).state,
      ).toBe('contacting');
    });
  });

  describe('block and warn (FR-TEN-03)', () => {
    it('in block mode an override changes nothing', async () => {
      const e = await entryAt('candidate_approved');
      expect(
        await guardsOf(submit(e.id, [{ guard: 'consent', reason: 'Verbal consent on a call' }])),
      ).toContain('consent');
    });

    it('in warn mode each warned guard needs its own override; the others still stop it', async () => {
      await setModes({ consent: 'warn', resumeApproval: 'warn' });
      try {
        const e = await entryAt('candidate_approved');
        await approveReport(e.id, 'ok');
        expect(
          await guardsOf(submit(e.id, [{ guard: 'consent', reason: 'Verbal consent on a call' }])),
        ).toEqual(['resumeApproval']);
        const done = await submit(e.id, [
          { guard: 'consent', reason: 'Verbal consent on a call' },
          { guard: 'resumeApproval', reason: 'Candidate approved by phone, paperwork to follow' },
        ]);
        expect(done.state).toBe('submitted');
        const row = await admin.query(
          `SELECT overrides FROM "PipelineTransition" WHERE "entryId" = $1 AND "toState" = 'submitted'`,
          [e.id],
        );
        expect(row.rows[0].overrides).toHaveLength(2);
      } finally {
        await setModes({});
      }
    });

    it('never lets the assessment be skipped while it is set to block, even when others are warned', async () => {
      await setModes({ consent: 'warn', resumeApproval: 'warn' });
      try {
        const e = await entryAt('candidate_approved');
        expect(
          await guardsOf(
            submit(e.id, [
              { guard: 'consent', reason: 'Verbal consent on a call' },
              { guard: 'resumeApproval', reason: 'By phone for now' },
              { guard: 'recruiterAssessment', reason: 'Will write later' },
            ]),
          ),
        ).toEqual(['recruiterAssessment']);
      } finally {
        await setModes({});
      }
    });
  });
});
