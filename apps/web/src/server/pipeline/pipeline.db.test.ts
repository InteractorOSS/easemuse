// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_REJECTION_REASONS, type AgencyActor, type PipelineState } from '@easemuse/core';
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
import { registerPipelineGuard } from './guards';
import { addCandidateToPosition, getEntry, listPositionPipeline, transitionEntry } from './service';

describe.skipIf(!dbAvailable())('pipeline service (T-3-01, T-2-07)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let lead: AgencyActor;
  let rec1: AgencyActor;
  let rec2: AgencyActor;
  let outsider: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  const newPosition = async (owner = rec1) =>
    (await run((tx) => createPosition(tx, owner, { clientId, title: 'Role', location: 'Seoul' })))
      .id;
  const newCandidate = (status: 'active' | 'draft' | 'discarded' = 'active') =>
    run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: agencyA,
          fullName: `Cand ${randomUUID().slice(0, 6)}`,
          source: 'linkedin',
          createdById: rec1.userId,
          status,
        },
        select: { id: true },
      }),
    ).then((c) => c.id);
  const add = (positionId: string, candidateId: string, actor = rec1) =>
    run((tx) => addCandidateToPosition(tx, actor, positionId, { candidateId }));
  const move = (
    entryId: string,
    to: PipelineState,
    rest: {
      reason?: string;
      reasonCode?: string;
      overrideGuards?: { guard: 'consent'; reason: string }[];
    } = {},
    actor = rec1,
  ) => run((tx) => transitionEntry(tx, actor, entryId, { to, ...rest }));
  /** Puts the three submission records on file for an entry, as the recruiter would have by then. */
  const satisfySubmissionGuards = async (entryId: string) => {
    await run(async (tx) => {
      const entry = await tx.pipelineEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: { position: true },
      });
      const approval = await tx.approval.create({
        data: {
          agencyId: agencyA,
          subject: 'tailored_resume',
          subjectId: entryId,
          versionId: randomUUID(),
          decision: 'approved',
          source: 'recorded_by_recruiter',
          approverName: 'Candidate',
          decidedAt: new Date(),
        },
      });
      await tx.tailoredResume.create({
        data: { agencyId: agencyA, entryId, artifactId: randomUUID(), approvalId: approval.id },
      });
      await tx.consent.create({
        data: {
          agencyId: agencyA,
          candidateId: entry.candidateId,
          clientId: entry.position.clientId,
          action: 'given',
          at: new Date(),
          source: 'recorded_by_recruiter',
        },
      });
    });
    const artifact = await run((tx) =>
      createArtifact(tx, {
        agencyId: agencyA,
        kind: 'submission_report',
        subject: { type: 'pipeline_entry', id: entryId },
      }),
    );
    const version = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agencyA,
        artifactId: artifact.id,
        content: { recruiterAssessment: 'Strong fit.' },
        origin: 'human',
        createdById: rec1.userId,
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
  /** The position has passed the JD gate, so working candidates is allowed. */
  const satisfyJdGuard = (positionId: string) =>
    run((tx) => tx.position.update({ where: { id: positionId }, data: { status: 'sourcing' } }));
  const entryFor = async (actor = rec1) => {
    const positionId = await newPosition(actor);
    const candidateId = await newCandidate();
    return { positionId, candidateId, entry: await add(positionId, candidateId, actor) };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Pipe A');
    agencyB = await createAgency(admin, 'Pipe B');
    const [u1, u2, u3, u4] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    for (const [u, role] of [
      [u1, 'lead'],
      [u2, 'recruiter'],
      [u3, 'recruiter'],
    ] as const) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
        [agencyA, u, role],
      );
    }
    lead = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'lead' };
    rec1 = { kind: 'agency', userId: u2, agencyId: agencyA, role: 'recruiter' };
    rec2 = { kind: 'agency', userId: u3, agencyId: agencyA, role: 'recruiter' };
    outsider = { kind: 'agency', userId: u4, agencyId: agencyB, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, lead, { name: 'Pipe Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  describe('adding a candidate to a position', () => {
    it('creates an entry in "sourced", owned by the person who added it, with a first history row', async () => {
      const { entry, positionId, candidateId } = await entryFor();
      expect(entry).toMatchObject({
        positionId,
        candidateId,
        state: 'sourced',
        ownerId: rec1.userId,
      });
      const history = await admin.query(
        `SELECT "fromState", "toState", "actorId" FROM "PipelineTransition" WHERE "entryId" = $1`,
        [entry.id],
      );
      expect(history.rows).toEqual([{ fromState: null, toState: 'sourced', actorId: rec1.userId }]);
    });

    it('lets the same person be in two positions with separate states, but not twice in one', async () => {
      const candidateId = await newCandidate();
      const [p1, p2] = [await newPosition(), await newPosition()];
      const first = await add(p1, candidateId);
      const second = await add(p2, candidateId);
      await move(first.id, 'reviewed');
      expect((await run((tx) => getEntry(tx, rec1, second.id))).state).toBe('sourced');
      await expect(add(p1, candidateId)).rejects.toMatchObject({ status: 409 });
    });

    it('needs a confirmed candidate, and not a closed position', async () => {
      const positionId = await newPosition();
      await expect(add(positionId, await newCandidate('draft'))).rejects.toMatchObject({
        status: 409,
      });
      await expect(add(positionId, await newCandidate('discarded'))).rejects.toMatchObject({
        status: 404,
      });
      await expect(add(positionId, randomUUID())).rejects.toMatchObject({ status: 404 });
      await run((tx) =>
        tx.position.update({ where: { id: positionId }, data: { status: 'cancelled' } }),
      );
      await expect(add(positionId, await newCandidate())).rejects.toMatchObject({ status: 409 });
    });

    it('lets any member who can see the position add to it', async () => {
      const positionId = await newPosition(rec1);
      const entry = await add(positionId, await newCandidate(), rec2);
      expect(entry.ownerId).toBe(rec2.userId);
    });

    it('keeps agencies apart: another agency cannot add to or read this pipeline', async () => {
      const { positionId, candidateId, entry } = await entryFor();
      await expect(
        appScope(handle).withAgency(agencyB, (tx) =>
          addCandidateToPosition(tx, outsider, positionId, { candidateId }),
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        appScope(handle).withAgency(agencyB, (tx) => getEntry(tx, outsider, entry.id)),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('moving a candidate', () => {
    it('follows the state map along the happy path, writing one history row per move', async () => {
      const { entry } = await entryFor();
      const path: PipelineState[] = [
        'reviewed',
        'screened',
        'contacting',
        'interested',
        'qualified',
        'resume_ready',
        'candidate_approved',
        'submitted',
        'interviewing',
        'offer',
        'accepted',
        'started',
      ];
      for (const to of path) {
        // Submitting needs the resume approval, consent and assessment on record (see guard-library.db.test.ts).
        if (to === 'submitted') await satisfySubmissionGuards(entry.id);
        if (to === 'contacting') await satisfyJdGuard(entry.positionId);
        expect((await move(entry.id, to)).state).toBe(to);
      }
      const history = await admin.query(
        `SELECT "fromState", "toState" FROM "PipelineTransition" WHERE "entryId" = $1 ORDER BY "createdAt", id`,
        [entry.id],
      );
      expect(history.rows.map((r) => `${r.fromState ?? '-'}>${r.toState}`)).toEqual([
        '->sourced',
        ...['sourced', ...path].slice(0, -1).map((f, i) => `${f}>${path[i]}`),
      ]);
    });

    it('refuses a move the map does not allow (409) and changes nothing', async () => {
      const { entry } = await entryFor();
      await expect(move(entry.id, 'submitted')).rejects.toMatchObject({
        status: 409,
        code: 'invalid_transition',
      });
      await expect(move(entry.id, 'sourced')).rejects.toMatchObject({ code: 'invalid_transition' });
      expect((await run((tx) => getEntry(tx, rec1, entry.id))).state).toBe('sourced');
      const history = await admin.query(
        `SELECT count(*)::int AS n FROM "PipelineTransition" WHERE "entryId" = $1`,
        [entry.id],
      );
      expect(history.rows[0].n).toBe(1);
    });

    it('lets a candidate leave at any open state, and nothing moves after the end', async () => {
      const { entry } = await entryFor();
      await move(entry.id, 'reviewed');
      await move(entry.id, 'withdrawn', { reasonCode: DEFAULT_REJECTION_REASONS[0] });
      await expect(move(entry.id, 'reviewed')).rejects.toMatchObject({
        code: 'invalid_transition',
        message: expect.stringContaining('ended'),
      });
    });

    it('needs a reason from the agency list when a candidate is rejected or drops out', async () => {
      const { entry } = await entryFor();
      await expect(move(entry.id, 'withdrawn')).rejects.toMatchObject({
        status: 422,
        fields: { reasonCode: expect.any(String) },
      });
      await expect(
        move(entry.id, 'withdrawn', { reasonCode: 'Made up reason' }),
      ).rejects.toMatchObject({ status: 422 });
      await move(entry.id, 'withdrawn', {
        reasonCode: DEFAULT_REJECTION_REASONS[1],
        reason: 'Took another offer',
      });
      const row = await admin.query(
        `SELECT "reasonCode", reason FROM "PipelineTransition" WHERE "entryId" = $1 AND "toState" = 'withdrawn'`,
        [entry.id],
      );
      expect(row.rows[0]).toEqual({
        reasonCode: DEFAULT_REJECTION_REASONS[1],
        reason: 'Took another offer',
      });
    });

    it('needs a written reason for a hold, a reneged offer or closing', async () => {
      const { entry } = await entryFor();
      await expect(move(entry.id, 'closed')).rejects.toMatchObject({
        status: 422,
        fields: { reason: expect.any(String) },
      });
      await move(entry.id, 'closed', { reason: 'Position cancelled' });
    });

    it('is for the entry owner, a lead or an admin; others get 403', async () => {
      const { entry } = await entryFor(rec1);
      await expect(move(entry.id, 'reviewed', {}, rec2)).rejects.toMatchObject({ status: 403 });
      expect((await move(entry.id, 'reviewed', {}, lead)).state).toBe('reviewed');
    });

    it('is a 404 for a recruiter who cannot see the position (own-and-shared rule)', async () => {
      const { entry } = await entryFor(rec1);
      await admin.query(
        `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{visibility}', '"own_and_shared"') WHERE id = $1`,
        [agencyA],
      );
      try {
        await expect(move(entry.id, 'reviewed', {}, rec2)).rejects.toMatchObject({ status: 404 });
        await expect(run((tx) => getEntry(tx, rec2, entry.id))).rejects.toMatchObject({
          status: 404,
        });
        expect((await move(entry.id, 'reviewed', {}, rec1)).state).toBe('reviewed');
      } finally {
        await admin.query(`UPDATE "Agency" SET settings = settings - 'visibility' WHERE id = $1`, [
          agencyA,
        ]);
      }
    });

    it('records the move on both timelines and sends a live update on the position channel', async () => {
      const { entry, positionId, candidateId } = await entryFor();
      const notices: string[] = [];
      const listener = await adminClient();
      await listener.query('LISTEN em_realtime');
      listener.on('notification', (n) => notices.push(n.payload ?? ''));
      await move(entry.id, 'reviewed');
      await new Promise((r) => setTimeout(r, 200));
      await listener.end();
      const log = await admin.query(
        `SELECT "entityType", data FROM "ActivityLog" WHERE action = 'pipeline.transition' AND data->>'entryId' = $1 ORDER BY "entityType"`,
        [entry.id],
      );
      expect(log.rows.map((r) => r.entityType)).toEqual(['candidate', 'position']);
      expect(log.rows[0].data).toMatchObject({ from: 'sourced', to: 'reviewed' });
      const mine = notices.map((n) => JSON.parse(n)).filter((n) => n.ids.entryId === entry.id);
      expect(mine).toEqual([
        expect.objectContaining({
          channel: `agency:${agencyA}:position:${positionId}`,
          type: 'pipeline.transition',
          ids: { entryId: entry.id, from: 'sourced', to: 'reviewed' },
        }),
      ]);
      void candidateId;
    });

    it('lists a position pipeline for anyone who can see the position', async () => {
      const { positionId, entry } = await entryFor();
      const list = await run((tx) => listPositionPipeline(tx, rec2, positionId));
      expect(list.map((e) => e.id)).toEqual([entry.id]);
      expect(list[0]!.candidateName).toMatch(/^Cand /);
    });
  });

  describe('guards', () => {
    registerPipelineGuard(async ({ to, entry, tx }) => {
      if (to !== 'reviewed') return null;
      const note = await tx.pipelineEntry.findUnique({
        where: { id: entry.id },
        select: { manualRank: true },
      });
      return note?.manualRank === 99
        ? { guard: 'consent', message: 'Test guard: not allowed while rank is 99.' }
        : null;
    });
    const setMode = (mode: 'block' | 'warn') =>
      admin.query(
        `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{guardModes}', $2::jsonb) WHERE id = $1`,
        [
          agencyA,
          JSON.stringify({
            jdApproval: 'block',
            resumeApproval: 'block',
            consent: mode,
            recruiterAssessment: 'block',
          }),
        ],
      );
    const reset = () =>
      admin.query(`UPDATE "Agency" SET settings = settings - 'guardModes' WHERE id = $1`, [
        agencyA,
      ]);

    it('stops a move while a guard is unmet and says which one', async () => {
      const { entry } = await entryFor();
      await run((tx) =>
        tx.pipelineEntry.update({ where: { id: entry.id }, data: { manualRank: 99 } }),
      );
      await expect(move(entry.id, 'reviewed')).rejects.toMatchObject({
        status: 409,
        code: 'guard_failed',
        guards: [
          { guard: 'consent', mode: 'block', message: expect.stringContaining('Test guard') },
        ],
      });
      expect((await run((tx) => getEntry(tx, rec1, entry.id))).state).toBe('sourced');
    });

    it('in warn mode goes ahead with an override and its reason, kept in the history and on the timeline', async () => {
      await setMode('warn');
      try {
        const { entry } = await entryFor();
        await run((tx) =>
          tx.pipelineEntry.update({ where: { id: entry.id }, data: { manualRank: 99 } }),
        );
        await expect(move(entry.id, 'reviewed')).rejects.toMatchObject({
          code: 'guard_failed',
          guards: [{ mode: 'warn' }],
        });
        const done = await move(entry.id, 'reviewed', {
          overrideGuards: [{ guard: 'consent', reason: 'Verbal consent on a call today' }],
        });
        expect(done.state).toBe('reviewed');
        const history = await admin.query(
          `SELECT overrides FROM "PipelineTransition" WHERE "entryId" = $1 AND "toState" = 'reviewed'`,
          [entry.id],
        );
        expect(history.rows[0].overrides).toEqual([
          { guard: 'consent', reason: 'Verbal consent on a call today' },
        ]);
      } finally {
        await reset();
      }
    });
  });
});
