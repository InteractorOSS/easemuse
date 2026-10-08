// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import {
  addDraftVersion,
  approveVersion,
  createArtifact,
  findArtifact,
  getArtifactWithVersions,
} from '@/server/artifacts/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { confirmCandidate } from './confirm';
import { duplicatesForCandidate } from './duplicates';
import { createCandidateDraft } from './intake';
import { discardDraft, getCandidate, startManualProfile } from './service';

const profile = (over: Record<string, unknown> = {}) => ({
  fullName: 'Alex Kim',
  email: 'alex@x.com',
  phone: '+82 10-1234-5678',
  currentPosition: { title: 'Senior HR Director', company: 'Northwind Inc.' },
  careerHistory: [
    {
      company: 'Northwind Inc.',
      title: 'Senior HR Director',
      start: '2019',
      end: null,
      current: true,
      summary: '',
    },
    {
      company: 'Contoso',
      title: 'HR Manager',
      start: 'Mar 2014',
      end: '2019',
      current: false,
      summary: '',
    },
  ],
  education: [],
  coreSkills: ['payroll', 'compliance'],
  industryExperience: [],
  technicalSkills: ['payroll', 'Workday'],
  leadershipExperience: null,
  teamSize: '12',
  careerProgression: null,
  location: 'Seoul',
  workAuthorization: null,
  compensationExpectation: null,
  majorAchievements: [],
  potentialMotivation: null,
  potentialConcerns: [],
  ...over,
});

describe.skipIf(!dbAvailable())('confirming and merging candidates (T-2-05, T-2-06)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let actor: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);

  /** A draft as the AI step leaves it: a candidate with a document and a profile draft to review. */
  const newDraft = async (
    content: Record<string, unknown> = profile(),
    opts: { profileUrl?: string; noProfile?: boolean } = {},
  ) => {
    const draft = await run((tx) =>
      createCandidateDraft(
        tx,
        actor,
        { source: 'linkedin', ...(opts.profileUrl ? { profileUrl: opts.profileUrl } : {}) },
        {
          filename: `${randomUUID()}.txt`,
          bytes: new TextEncoder().encode(`resume ${randomUUID()}`),
          kind: 'resume',
        },
      ),
    );
    let versionId: string | null = null;
    if (!opts.noProfile) {
      const artifact = await run((tx) =>
        createArtifact(tx, {
          agencyId: agencyA,
          kind: 'candidate_profile',
          subject: { type: 'candidate', id: draft.candidateId },
        }),
      );
      versionId = (
        await run((tx) =>
          addDraftVersion(tx, {
            agencyId: agencyA,
            artifactId: artifact.id,
            content,
            origin: 'ai',
            createdById: actor.userId,
          }),
        )
      ).id;
    }
    return { ...draft, versionId };
  };
  const confirm = (
    draftId: string,
    rest: { resolution?: 'create' | 'merge' | 'link'; targetId?: string; reason?: string } = {},
  ) => run((tx) => confirmCandidate(tx, actor, { draftId, ...rest }));
  const row = (id: string) =>
    admin.query(`SELECT * FROM "Candidate" WHERE id = $1`, [id]).then((r) => r.rows[0]);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Confirm A');
    agencyB = await createAgency(admin, 'Confirm B');
    actor = {
      kind: 'agency',
      userId: await createUser(admin),
      agencyId: agencyA,
      role: 'recruiter',
    };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  describe('confirming a new candidate', () => {
    it('approves the profile, fills the candidate from it, and makes the candidate active', async () => {
      const d = await newDraft(
        profile({
          fullName: 'Pat Unique',
          email: 'pat.unique@x.com',
          phone: '+1 415 555 0101',
          currentPosition: { title: 'Director', company: 'Fabrikam' },
          careerHistory: [
            {
              company: 'Fabrikam',
              title: 'Director',
              start: '2016',
              end: null,
              current: true,
              summary: '',
            },
          ],
        }),
      );
      const result = await confirm(d.candidateId);
      expect(result).toEqual({
        candidateId: d.candidateId,
        resolution: 'create',
        mergedIntoId: null,
      });
      const c = await row(d.candidateId);
      expect(c).toMatchObject({
        status: 'active',
        fullName: 'Pat Unique',
        email: 'pat.unique@x.com',
        phone: '+1 415 555 0101',
        phoneKey: '4155550101',
        currentTitle: 'Director',
        location: 'Seoul',
        employerKeys: ['fabrikam'],
        skills: ['payroll', 'compliance', 'Workday'],
      });
      expect(c.yearsExperience).toBe(new Date().getUTCFullYear() - 2016);
      const view = await run((tx) => getCandidate(tx, d.candidateId));
      expect(view.approvedProfileVersionId).toBe(d.versionId);
      expect(c.profileArtifactId).toBe(view.profileArtifactId);
    });

    it('accepts a profile the recruiter already approved in the editor', async () => {
      const d = await newDraft(
        profile({
          fullName: 'Early Eve',
          email: 'eve@x.com',
          phone: null,
          careerHistory: [],
          currentPosition: { title: null, company: null },
        }),
      );
      await run((tx) => approveVersion(tx, actor, d.versionId!));
      expect((await row(d.candidateId)).status).toBe('draft');
      await confirm(d.candidateId);
      expect(await row(d.candidateId)).toMatchObject({ status: 'active', fullName: 'Early Eve' });
    });

    it('needs a profile draft and a name', async () => {
      const none = await newDraft(profile(), { noProfile: true });
      await expect(confirm(none.candidateId)).rejects.toMatchObject({ status: 409 });
      const nameless = await newDraft(profile({ fullName: null }));
      await expect(confirm(nameless.candidateId)).rejects.toMatchObject({
        status: 422,
        fields: { fullName: expect.any(String) },
      });
      expect((await row(nameless.candidateId)).status).toBe('draft');
    });

    it('lets the recruiter type the profile when the AI cannot run, and says why the AI failed (FR-SRC-02, NFR-R03)', async () => {
      const draft = await newDraft(profile(), { noProfile: true });
      // A failed AI attempt, as the gateway leaves it when the account has no credit.
      await admin.query(
        `INSERT INTO "AiGeneration" (id, "agencyId", purpose, "requestedById", "promptVersion", model, "inputRefs", status, error, "updatedAt")
         VALUES (gen_random_uuid(), $1, 'profile.structure', $2, 'v1', 'claude-sonnet-5-5', $3, 'failed', 'ai_account_no_credit', now())`,
        [agencyA, actor.userId, JSON.stringify({ candidateId: draft.candidateId })],
      );
      expect((await run((tx) => getCandidate(tx, draft.candidateId))).profileAi).toEqual({
        status: 'failed',
        error: 'ai_account_no_credit',
      });

      const started = await run((tx) => startManualProfile(tx, actor, draft.candidateId));
      expect(started.created).toBe(true);
      // A second click keeps the draft that is already there.
      expect(await run((tx) => startManualProfile(tx, actor, draft.candidateId))).toEqual({
        artifactId: started.artifactId,
        created: false,
      });
      const blank = await run((tx) => getArtifactWithVersions(tx, started.artifactId));
      expect(blank?.versions).toHaveLength(1);
      expect(blank?.versions[0]).toMatchObject({ origin: 'human', status: 'draft' });

      // The recruiter fills it in, then confirms as usual.
      await run((tx) =>
        addDraftVersion(tx, {
          agencyId: agencyA,
          artifactId: started.artifactId,
          content: profile({
            fullName: `Jordan Typed ${randomUUID().slice(0, 8)}`,
            email: `${randomUUID()}@example.com`,
            phone: null,
            careerHistory: [],
          }),
          origin: 'human',
          createdById: actor.userId,
        }),
      );
      await confirm(draft.candidateId);
      expect((await row(draft.candidateId)).status).toBe('active');
      await expect(
        run((tx) => startManualProfile(tx, actor, draft.candidateId)),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('cannot confirm the same candidate twice, or something that is not there', async () => {
      const d = await newDraft(
        profile({
          fullName: 'Twice Tess',
          email: 'tess@x.com',
          phone: null,
          careerHistory: [],
          currentPosition: { title: null, company: null },
        }),
      );
      await confirm(d.candidateId);
      await expect(confirm(d.candidateId)).rejects.toMatchObject({ status: 409 });
      await expect(confirm(randomUUID())).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('when the person is already in the database', () => {
    let existing: string;
    beforeAll(async () => {
      const d = await newDraft(profile());
      await confirm(d.candidateId);
      existing = d.candidateId;
    });
    const duplicateDraft = () => newDraft(profile({ fullName: 'Alex Kim' }));

    it('shows the existing candidate as a possible duplicate and refuses to save without a decision (409)', async () => {
      const d = await duplicateDraft();
      const found = await run((tx) => duplicatesForCandidate(tx, d.candidateId));
      expect(found[0]).toMatchObject({ candidateId: existing, strength: 'exact' });
      await expect(confirm(d.candidateId)).rejects.toMatchObject({
        status: 409,
        code: 'possible_duplicate',
      });
      expect((await row(d.candidateId)).status).toBe('draft');
    });

    it('lets the recruiter create anyway, but only with a reason', async () => {
      const d = await duplicateDraft();
      await expect(confirm(d.candidateId, { resolution: 'create' })).rejects.toMatchObject({
        status: 422,
      });
      await confirm(d.candidateId, { resolution: 'create', reason: 'A different Alex Kim' });
      expect((await row(d.candidateId)).status).toBe('active');
      const log = await admin.query(
        `SELECT data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'candidate.confirmed'`,
        [d.candidateId],
      );
      expect(log.rows[0].data).toMatchObject({
        resolution: 'create',
        reason: 'A different Alex Kim',
        duplicates: [existing],
      });
    });

    it('links the two, keeping both, and notes it on both timelines', async () => {
      const d = await duplicateDraft();
      await expect(confirm(d.candidateId, { resolution: 'link' })).rejects.toBeDefined(); // schema wants a target; the service too
      await confirm(d.candidateId, {
        resolution: 'link',
        targetId: existing,
        reason: 'Same family, different person',
      });
      expect((await row(d.candidateId)).status).toBe('active');
      const logs = await admin.query(
        `SELECT "entityId" FROM "ActivityLog" WHERE action = 'candidate.linked' AND "entityId" = ANY($1::uuid[])`,
        [[d.candidateId, existing]],
      );
      expect(logs.rows.map((r) => r.entityId).sort()).toEqual([d.candidateId, existing].sort());
    });

    it('refuses a link or merge target that is not an active candidate, or is the draft itself', async () => {
      const d = await duplicateDraft();
      const other = await newDraft(profile({ fullName: 'Not Active', email: 'na@x.com' }));
      await expect(
        confirm(d.candidateId, { resolution: 'merge', targetId: other.candidateId }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        confirm(d.candidateId, { resolution: 'merge', targetId: d.candidateId }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        confirm(d.candidateId, { resolution: 'merge', targetId: randomUUID() }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('merges into the existing candidate and keeps both resumes and the history', async () => {
      const d = await duplicateDraft();
      const beforeDocs = (await run((tx) => getCandidate(tx, existing))).documents.length;
      const result = await confirm(d.candidateId, {
        resolution: 'merge',
        targetId: existing,
        reason: 'New resume of the same person',
      });
      expect(result).toEqual({
        candidateId: existing,
        resolution: 'merge',
        mergedIntoId: existing,
      });

      // Both resumes are now under the survivor, nothing was deleted.
      const view = await run((tx) => getCandidate(tx, existing));
      expect(view.documents).toHaveLength(beforeDocs + 1);
      expect(view.documents.map((x) => x.id)).toContain(d.documentId);
      const blob = await admin.query(
        `SELECT count(*)::int AS n FROM "FileBlob" b JOIN "CandidateDocument" c ON c."fileId" = b."fileId" WHERE c."candidateId" = $1`,
        [existing],
      );
      expect(blob.rows[0].n).toBe(beforeDocs + 1);

      // The draft is closed with a pointer, and is no longer found as a candidate.
      expect(await row(d.candidateId)).toMatchObject({
        status: 'discarded',
        mergedIntoId: existing,
      });
      await expect(run((tx) => getCandidate(tx, d.candidateId))).rejects.toMatchObject({
        status: 404,
      });

      // The new profile is offered as a draft to review; the approved profile did not change by itself.
      const artifact = (await run((tx) =>
        findArtifact(tx, {
          kind: 'candidate_profile',
          subject: { type: 'candidate', id: existing },
        }),
      ))!;
      const full = await run((tx) => getArtifactWithVersions(tx, artifact.id));
      expect(full.versions.filter((v) => v.status === 'draft')).toHaveLength(1);
      expect(full.approvedVersionId).not.toBeNull();

      const logs = await admin.query(
        `SELECT action, data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'candidate.merged'`,
        [existing],
      );
      expect(logs.rows.at(-1).data).toMatchObject({
        fromCandidateId: d.candidateId,
        documentIds: [d.documentId],
        reason: 'New resume of the same person',
      });
    });

    it('only ever shows active, unmerged candidates as duplicates', async () => {
      const probe = await newDraft(profile({ fullName: 'Probe', email: 'alex@x.com' }));
      const ids = (await run((tx) => duplicatesForCandidate(tx, probe.candidateId))).map(
        (m) => m.candidateId,
      );
      expect(ids).toContain(existing);
      const states = await admin.query(
        `SELECT status, "mergedIntoId" FROM "Candidate" WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      expect(states.rows.every((r) => r.status === 'active' && r.mergedIntoId === null)).toBe(true);
    });
  });

  describe('discarding a draft', () => {
    it('closes it, keeps the stored file, and cannot be done to a confirmed candidate', async () => {
      const d = await newDraft(
        profile({
          fullName: 'Throwaway',
          email: 'tw@x.com',
          phone: null,
          careerHistory: [],
          currentPosition: { title: null, company: null },
        }),
      );
      await run((tx) => discardDraft(tx, actor, d.candidateId));
      expect((await row(d.candidateId)).status).toBe('discarded');
      const doc = await admin.query(
        `SELECT count(*)::int AS n FROM "CandidateDocument" WHERE id = $1`,
        [d.documentId],
      );
      expect(doc.rows[0].n).toBe(1);
      const ok = await newDraft(
        profile({
          fullName: 'Kept Kay',
          email: 'kk@x.com',
          phone: null,
          careerHistory: [],
          currentPosition: { title: null, company: null },
        }),
      );
      await confirm(ok.candidateId);
      await expect(run((tx) => discardDraft(tx, actor, ok.candidateId))).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  it('keeps agencies apart', async () => {
    const d = await newDraft(
      profile({
        fullName: 'Iso Ida',
        email: 'ida@x.com',
        phone: null,
        careerHistory: [],
        currentPosition: { title: null, company: null },
      }),
    );
    const other: AgencyActor = {
      kind: 'agency',
      userId: await createUser(admin),
      agencyId: agencyB,
      role: 'recruiter',
    };
    await expect(
      appScope(handle).withAgency(agencyB, (tx) =>
        confirmCandidate(tx, other, { draftId: d.candidateId }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      appScope(handle).withAgency(agencyB, (tx) => getCandidate(tx, d.candidateId)),
    ).rejects.toMatchObject({ status: 404 });
  });
});
