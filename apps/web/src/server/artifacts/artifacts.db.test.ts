// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import {
  type Subject,
  addDraftVersion,
  saveEditToLatest,
  setFactCheck,
  listVersionsOfGeneration,
  approveVersion,
  createArtifact,
  discardVersion,
  editDraft,
  findOrCreateArtifact,
  getArtifactWithVersions,
  readApproved,
} from './service';

const CANDIDATE_PROFILE = {
  fullName: null,
  email: null,
  phone: null,
  currentPosition: { title: null, company: null },
  careerHistory: [],
  education: [],
  coreSkills: [],
  industryExperience: [],
  technicalSkills: [],
  leadershipExperience: null,
  teamSize: null,
  careerProgression: null,
  location: null,
  workAuthorization: null,
  compensationExpectation: null,
  majorAchievements: [],
  potentialMotivation: null,
  potentialConcerns: [],
};

const PROFILE = {
  summary: 's',
  criteria: [],
  expectations: { sixMonths: '', twelveMonths: '' },
  keyChallenges: [],
};

describe.skipIf(!dbAvailable())('artifact lifecycle (ADR-006)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let scope: ReturnType<typeof appScope>;
  let agencyA: string;
  let agencyB: string;
  let actor: AgencyActor;
  const positionId = randomUUID();
  const entryId = randomUUID();
  const userId = randomUUID();

  const run = <T>(fn: Parameters<typeof scope.withAgency<T>>[1]) => scope.withAgency(agencyA, fn);
  const newArtifact = (
    kind: Parameters<typeof createArtifact>[1]['kind'],
    subject: Subject = { type: 'position', id: positionId },
  ) => run((tx) => createArtifact(tx, { agencyId: agencyA, kind, subject }));
  const draft = (
    artifactId: string,
    content: unknown = { title: 'v' },
    origin: 'ai' | 'human' = 'ai',
  ) =>
    run((tx) =>
      addDraftVersion(tx, { agencyId: agencyA, artifactId, content, origin, createdById: userId }),
    );

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(4);
    scope = appScope(handle);
    agencyA = await createAgency(admin, 'Artifacts A');
    agencyB = await createAgency(admin, 'Artifacts B');
    actor = { kind: 'agency', userId, agencyId: agencyA, role: 'recruiter' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  describe('creating', () => {
    it('only accepts the subject type the kind belongs to', async () => {
      await expect(
        newArtifact('improved_jd', { type: 'candidate', id: randomUUID() }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        newArtifact('match_analysis', { type: 'position', id: randomUUID() }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('numbers versions 1, 2, 3 and starts every one as a draft', async () => {
      const { id } = await newArtifact('improved_jd');
      const versions = [await draft(id), await draft(id), await draft(id)];
      expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
      expect(versions.every((v) => v.status === 'draft' && v.origin === 'ai')).toBe(true);
    });

    it('survives two writers adding a version at the same moment', async () => {
      const { id } = await newArtifact('improved_jd');
      // More writers than connections, so some must wait for another to commit.
      const results = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => draft(id, { a: n })));
      expect(results.map((v) => v.version).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('rejects content that is not an object (422)', async () => {
      const { id } = await newArtifact('improved_jd');
      await expect(draft(id, 'just text')).rejects.toMatchObject({
        status: 422,
        code: 'invalid_input',
      });
      await expect(draft(id, [1, 2])).rejects.toMatchObject({ status: 422 });
    });

    it('findOrCreateArtifact reuses the artifact for the same subject', async () => {
      const subject = { type: 'position' as const, id: randomUUID() };
      const a = await run((tx) =>
        findOrCreateArtifact(tx, { agencyId: agencyA, kind: 'improved_jd', subject }),
      );
      const b = await run((tx) =>
        findOrCreateArtifact(tx, { agencyId: agencyA, kind: 'improved_jd', subject }),
      );
      expect(b.id).toBe(a.id);
    });

    it('never lets AI write the recruiter assessment, but lets a person', async () => {
      const subject = { type: 'pipeline_entry' as const, id: entryId };
      const report = await newArtifact('submission_report', subject);
      await expect(
        draft(report.id, { recruiterAssessment: 'AI opinion' }, 'ai'),
      ).rejects.toMatchObject({ code: 'human_only_field', status: 422 });
      await expect(draft(report.id, { recruiterAssessment: '' }, 'ai')).resolves.toBeTruthy();
      await expect(
        draft(report.id, { recruiterAssessment: 'My view' }, 'human'),
      ).resolves.toMatchObject({ origin: 'human' });
    });
  });

  describe('editing and discarding', () => {
    it('keeps the AI original and every edit as separate versions linked to their parent', async () => {
      const { id } = await newArtifact('improved_jd');
      const original = await draft(id, { text: 'ai' });
      const edit1 = await run((tx) => editDraft(tx, actor, original.id, { text: 'edit 1' }));
      const edit2 = await run((tx) => editDraft(tx, actor, edit1.id, { text: 'edit 2' }));
      expect([edit1.origin, edit2.origin]).toEqual(['ai_edited', 'ai_edited']);
      expect(edit1.parentVersionId).toBe(original.id);
      expect(edit2.parentVersionId).toBe(edit1.id);
      const all = await run((tx) => getArtifactWithVersions(tx, id));
      expect(all.versions.map((v) => [v.version, v.status])).toEqual([
        [3, 'draft'],
        [2, 'superseded'],
        [1, 'superseded'],
      ]);
      expect(all.versions.at(-1)!.content).toEqual({ text: 'ai' }); // the AI original is preserved
    });

    it('keeps a purely human draft as human when it is edited', async () => {
      const { id } = await newArtifact('improved_jd');
      const mine = await draft(id, { t: 1 }, 'human');
      expect((await run((tx) => editDraft(tx, actor, mine.id, { t: 2 }))).origin).toBe('human');
    });

    it('refuses to edit or discard anything that is not a draft', async () => {
      const { id } = await newArtifact('improved_jd');
      const v = await draft(id);
      await run((tx) => approveVersion(tx, actor, v.id));
      await expect(run((tx) => editDraft(tx, actor, v.id, { x: 1 }))).rejects.toMatchObject({
        status: 409,
        code: 'not_draft',
      });
      await expect(run((tx) => discardVersion(tx, actor, v.id))).rejects.toMatchObject({
        status: 409,
        code: 'not_draft',
      });
    });

    it('discards a draft and logs it', async () => {
      const { id } = await newArtifact('improved_jd');
      const v = await draft(id);
      expect((await run((tx) => discardVersion(tx, actor, v.id))).status).toBe('discarded');
      const log = await admin.query(
        `SELECT count(*)::int AS n FROM "ActivityLog" WHERE "agencyId" = $1 AND action = 'artifact.discarded' AND "entityId" = $2`,
        [agencyA, id],
      );
      expect(log.rows[0].n).toBe(1);
    });
  });

  describe('approving', () => {
    it('makes the version official, supersedes the previous approved one and logs it', async () => {
      const subject = { type: 'position' as const, id: randomUUID() };
      const { id } = await newArtifact('improved_jd', subject);
      const v1 = await draft(id, { n: 1 });
      const v2 = await draft(id, { n: 2 });
      expect(await run((tx) => readApproved(tx, { kind: 'improved_jd', subject }))).toBeNull();

      await run((tx) => approveVersion(tx, actor, v1.id));
      expect(
        (await run((tx) => readApproved(tx, { kind: 'improved_jd', subject })))?.content,
      ).toEqual({ n: 1 });
      await run((tx) => approveVersion(tx, actor, v2.id));

      const all = await run((tx) => getArtifactWithVersions(tx, id));
      expect(all.approvedVersionId).toBe(v2.id);
      expect(all.versions.map((v) => [v.version, v.status])).toEqual([
        [2, 'approved'],
        [1, 'superseded'],
      ]);
      expect(all.versions[0]).toMatchObject({ approvedById: userId });
      expect(all.versions[0]!.approvedAt).toBeInstanceOf(Date);
      expect(
        (await run((tx) => readApproved(tx, { kind: 'improved_jd', subject })))?.content,
      ).toEqual({ n: 2 });
    });

    it('never returns a later draft from readApproved', async () => {
      const subject = { type: 'position' as const, id: randomUUID() };
      const { id } = await newArtifact('improved_jd', subject);
      const v1 = await draft(id, { n: 1 });
      await run((tx) => approveVersion(tx, actor, v1.id));
      await draft(id, { n: 2 }); // a newer AI draft, not approved
      expect(
        (await run((tx) => readApproved(tx, { kind: 'improved_jd', subject })))?.content,
      ).toEqual({ n: 1 });
    });

    it('only approves drafts, once', async () => {
      const { id } = await newArtifact('improved_jd');
      const v = await draft(id);
      await run((tx) => approveVersion(tx, actor, v.id));
      await expect(run((tx) => approveVersion(tx, actor, v.id))).rejects.toMatchObject({
        status: 409,
        code: 'not_draft',
      });
      await expect(run((tx) => approveVersion(tx, actor, randomUUID()))).rejects.toMatchObject({
        status: 404,
      });
    });

    it('requires the recruiter assessment on a submission report', async () => {
      const subject = { type: 'pipeline_entry' as const, id: randomUUID() };
      const { id } = await newArtifact('submission_report', subject);
      const noAssessment = await draft(id, { summary: 'x' }, 'human');
      await expect(run((tx) => approveVersion(tx, actor, noAssessment.id))).rejects.toMatchObject({
        status: 409,
        code: 'missing_recruiter_assessment',
      });
    });

    it('rejects an AI-origin version that carries human-only text, even if it got into the database', async () => {
      const { id } = await newArtifact('match_analysis', {
        type: 'pipeline_entry',
        id: randomUUID(),
      });
      await admin.query(
        `INSERT INTO "ArtifactVersion" (id, "agencyId", "artifactId", version, content, status, origin, "createdById", "updatedAt")
         VALUES ($1, $2, $3, 1, $4, 'draft', 'ai', $5, now())`,
        [
          randomUUID(),
          agencyA,
          id,
          JSON.stringify({ recruiterAssessment: 'AI wrote this' }),
          userId,
        ],
      );
      const row = (
        await admin.query(`SELECT id FROM "ArtifactVersion" WHERE "artifactId" = $1`, [id])
      ).rows[0];
      await expect(run((tx) => approveVersion(tx, actor, row.id))).rejects.toMatchObject({
        code: 'human_only_field',
      });
    });

    describe('fact check (FR-AI-06)', () => {
      const withFactCheck = async (
        warnings: { id: string; claim: string; step: 'deterministic' | 'verifier' }[] | null,
      ) => {
        const { id } = await newArtifact('tailored_resume', {
          type: 'pipeline_entry',
          id: randomUUID(),
        });
        const v = await run((tx) =>
          addDraftVersion(tx, {
            agencyId: agencyA,
            artifactId: id,
            content: { text: 'resume' },
            origin: 'ai',
            createdById: userId,
            factCheck: warnings ? { ranAt: new Date().toISOString(), warnings } : null,
          }),
        );
        return { id, v };
      };

      it('refuses approval while the fact check has not run', async () => {
        const { v } = await withFactCheck(null);
        await expect(run((tx) => approveVersion(tx, actor, v.id))).rejects.toMatchObject({
          status: 409,
          code: 'factcheck_not_run',
        });
      });

      it('approves straight away when there are no warnings', async () => {
        const { v } = await withFactCheck([]);
        await expect(run((tx) => approveVersion(tx, actor, v.id))).resolves.toMatchObject({
          versionId: v.id,
        });
      });

      it('blocks on unresolved warnings and names them', async () => {
        const { v } = await withFactCheck([
          { id: 'w1', claim: 'Led 12 engineers', step: 'verifier' },
        ]);
        const error = await run((tx) => approveVersion(tx, actor, v.id)).catch((e) => e);
        expect(error).toMatchObject({ status: 409, code: 'factcheck_unresolved' });
        expect(error.fields['factCheckResolutions.w1']).toBe('Led 12 engineers');
      });

      it('approves once every warning is resolved, and stores who resolved what', async () => {
        const { id, v } = await withFactCheck([
          { id: 'w1', claim: 'Led 12 engineers', step: 'verifier' },
          { id: 'w2', claim: 'Cut cost 40%', step: 'deterministic' },
        ]);
        await run((tx) =>
          approveVersion(tx, actor, v.id, {
            factCheckResolutions: {
              w1: { kind: 'edited' },
              w2: { kind: 'confirmed', reason: 'Candidate confirmed on call' },
            },
          }),
        );
        const stored = (await run((tx) => getArtifactWithVersions(tx, id))).versions[0]!;
        expect(stored.status).toBe('approved');
        expect(
          stored.factCheck?.warnings.map((w) => [
            w.id,
            w.resolution?.kind,
            w.resolution?.resolvedById,
          ]),
        ).toEqual([
          ['w1', 'edited', userId],
          ['w2', 'confirmed', userId],
        ]);
        expect(stored.factCheck?.warnings[1]!.resolution?.reason).toBe(
          'Candidate confirmed on call',
        );
      });

      it('rejects a confirmation without a reason, and an unknown warning id (422)', async () => {
        const { v } = await withFactCheck([{ id: 'w1', claim: 'x', step: 'verifier' }]);
        await expect(
          run((tx) =>
            approveVersion(tx, actor, v.id, {
              factCheckResolutions: { w1: { kind: 'confirmed' } },
            }),
          ),
        ).rejects.toMatchObject({ status: 422 });
        await expect(
          run((tx) =>
            approveVersion(tx, actor, v.id, { factCheckResolutions: { nope: { kind: 'edited' } } }),
          ),
        ).rejects.toMatchObject({ status: 422 });
      });

      it('leaves the draft untouched when approval is refused', async () => {
        const { id, v } = await withFactCheck([{ id: 'w1', claim: 'x', step: 'verifier' }]);
        await run((tx) => approveVersion(tx, actor, v.id)).catch(() => undefined);
        const after = await run((tx) => getArtifactWithVersions(tx, id));
        expect(after.approvedVersionId).toBeNull();
        expect(after.versions[0]!.status).toBe('draft');
      });
    });
  });

  describe('stale marking (FR-MAT-07)', () => {
    const seed = (name: string) =>
      run(async (tx) => {
        const client = await tx.client.create({ data: { agencyId: agencyA, name } });
        const position = await tx.position.create({
          data: {
            agencyId: agencyA,
            clientId: client.id,
            ownerId: userId,
            title: name,
            location: 'Remote',
            matchingWeights: {},
          },
        });
        const candidate = await tx.candidate.create({
          data: { agencyId: agencyA, fullName: name, source: 'referral', createdById: userId },
        });
        const entry = await tx.pipelineEntry.create({
          data: {
            agencyId: agencyA,
            positionId: position.id,
            candidateId: candidate.id,
            ownerId: userId,
          },
        });
        const analysis = () =>
          tx.matchAnalysis.create({
            data: {
              agencyId: agencyA,
              entryId: entry.id,
              artifactId: randomUUID(),
              profileVersionId: randomUUID(),
              successProfileVersionId: randomUUID(),
              weights: {},
              overallScore: 80,
            },
          });
        return {
          positionId: position.id,
          candidateId: candidate.id,
          a1: await analysis(),
          a2: await analysis(),
        };
      });
    const staleOf = async (id: string) =>
      (await admin.query(`SELECT stale FROM "MatchAnalysis" WHERE id = $1`, [id])).rows[0]
        .stale as boolean;
    const approveNew = (artifactId: string, content: unknown = { v: 1 }) =>
      run(async (tx) => {
        const v = await addDraftVersion(tx, {
          agencyId: agencyA,
          artifactId,
          content,
          origin: 'ai',
          createdById: userId,
        });
        await approveVersion(tx, actor, v.id);
      });

    it('marks match analyses stale when a new success profile or candidate profile is approved', async () => {
      const seeded = await seed('Stale One');
      expect(await staleOf(seeded.a1.id)).toBe(false);

      const sp = await newArtifact('success_profile', { type: 'position', id: seeded.positionId });
      await approveNew(sp.id, PROFILE);
      expect(await staleOf(seeded.a1.id)).toBe(true);
      expect(await staleOf(seeded.a2.id)).toBe(true);

      await admin.query(`UPDATE "MatchAnalysis" SET stale = false WHERE id = ANY($1::uuid[])`, [
        [seeded.a1.id, seeded.a2.id],
      ]);
      const cp = await newArtifact('candidate_profile', {
        type: 'candidate',
        id: seeded.candidateId,
      });
      await approveNew(cp.id, CANDIDATE_PROFILE);
      expect(await staleOf(seeded.a1.id)).toBe(true);
    });

    it('does not touch analyses of other positions or candidates', async () => {
      const other = await seed('Stale Other');
      await approveNew(
        (await newArtifact('success_profile', { type: 'position', id: randomUUID() })).id,
        PROFILE,
      );
      await approveNew(
        (await newArtifact('candidate_profile', { type: 'candidate', id: randomUUID() })).id,
        CANDIDATE_PROFILE,
      );
      expect(await staleOf(other.a1.id)).toBe(false);
    });
  });

  describe('saving an edit to the latest version (POST /artifacts/:id/versions)', () => {
    it('edits the latest draft, superseding it', async () => {
      const { id } = await newArtifact('improved_jd');
      const v1 = await draft(id, { t: 'ai' });
      const v2 = await run((tx) => saveEditToLatest(tx, actor, id, { t: 'mine' }));
      expect(v2).toMatchObject({
        version: 2,
        origin: 'ai_edited',
        parentVersionId: v1.id,
        status: 'draft',
      });
      const all = await run((tx) => getArtifactWithVersions(tx, id));
      expect(all.versions.map((v) => v.status)).toEqual(['draft', 'superseded']);
    });

    it('after approval starts a new draft and keeps the approved version official', async () => {
      const subject = { type: 'position' as const, id: randomUUID() };
      const { id } = await newArtifact('improved_jd', subject);
      const v1 = await draft(id, { t: 1 });
      await run((tx) => approveVersion(tx, actor, v1.id));
      const v2 = await run((tx) => saveEditToLatest(tx, actor, id, { t: 2 }));
      expect(v2).toMatchObject({ version: 2, status: 'draft', parentVersionId: v1.id });
      expect(
        (await run((tx) => readApproved(tx, { kind: 'improved_jd', subject })))?.content,
      ).toEqual({ t: 1 });
    });

    it('validates the edit and 404s for an artifact with nothing to edit', async () => {
      const { id } = await newArtifact('improved_jd');
      await expect(run((tx) => saveEditToLatest(tx, actor, id, { t: 1 }))).rejects.toMatchObject({
        status: 404,
      });
      await draft(id, { t: 1 });
      await expect(
        run((tx) => saveEditToLatest(tx, actor, id, 'not an object')),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('versions must belong to the artifact in the URL', () => {
    it('refuses to approve or discard a version through another artifact id', async () => {
      const a = await newArtifact('improved_jd');
      const b = await newArtifact('improved_jd');
      const v = await draft(a.id);
      await expect(
        run((tx) => approveVersion(tx, actor, v.id, { expectedArtifactId: b.id })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        run((tx) => discardVersion(tx, actor, v.id, { expectedArtifactId: b.id })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        run((tx) => approveVersion(tx, actor, v.id, { expectedArtifactId: a.id })),
      ).resolves.toBeTruthy();
    });
  });

  it('lists the versions that came from one AI generation', async () => {
    const { id } = await newArtifact('improved_jd');
    const generationId = randomUUID();
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: agencyA,
        artifactId: id,
        content: { a: 1 },
        origin: 'ai',
        createdById: userId,
        aiGenerationId: generationId,
      }),
    );
    expect(await run((tx) => listVersionsOfGeneration(tx, generationId))).toEqual([
      { artifactId: id, versionId: v.id, version: 1, status: 'draft' },
    ]);
    expect(await run((tx) => listVersionsOfGeneration(tx, randomUUID()))).toEqual([]);
  });

  describe('storing a fact check (T-AI-08/09)', () => {
    const check = (ids: string[]) => ({
      ranAt: new Date().toISOString(),
      warnings: ids.map((id) => ({ id, claim: `claim ${id}`, step: 'deterministic' as const })),
    });
    const fresh = async () => {
      const { id } = await newArtifact('tailored_resume', {
        type: 'pipeline_entry',
        id: randomUUID(),
      });
      return { id, v: await draft(id, { text: 'resume' }) };
    };

    it('stores the result on a draft so approval can use it', async () => {
      const { id, v } = await fresh();
      await run((tx) => setFactCheck(tx, v.id, check(['w1'])));
      expect(
        (await run((tx) => getArtifactWithVersions(tx, id))).versions[0]!.factCheck?.warnings.map(
          (w) => w.id,
        ),
      ).toEqual(['w1']);
    });

    it('keeps earlier decisions for warnings that are still raised when the check is re-run', async () => {
      const { id, v } = await fresh();
      await run((tx) =>
        setFactCheck(tx, v.id, {
          ranAt: 'then',
          warnings: [
            {
              id: 'w1',
              claim: 'a',
              step: 'verifier',
              resolution: {
                kind: 'confirmed',
                reason: 'said on call',
                resolvedById: userId,
                resolvedAt: 'x',
              },
            },
            {
              id: 'w2',
              claim: 'b',
              step: 'verifier',
              resolution: { kind: 'edited', resolvedById: userId, resolvedAt: 'x' },
            },
          ],
        }),
      );
      await run((tx) => setFactCheck(tx, v.id, check(['w1', 'w3'])));
      const stored = (await run((tx) => getArtifactWithVersions(tx, id))).versions[0]!.factCheck!;
      expect(stored.warnings.map((w) => [w.id, w.resolution?.kind])).toEqual([
        ['w1', 'confirmed'],
        ['w3', undefined],
      ]);
    });

    it('refuses to change the check of anything that is not a draft', async () => {
      const { v } = await fresh();
      await run((tx) => setFactCheck(tx, v.id, check([])));
      await run((tx) => approveVersion(tx, actor, v.id));
      await expect(run((tx) => setFactCheck(tx, v.id, check(['w1'])))).rejects.toMatchObject({
        status: 409,
        code: 'not_draft',
      });
    });
  });

  it("hides one agency's artifacts from another (404)", async () => {
    const { id } = await newArtifact('improved_jd');
    await expect(
      scope.withAgency(agencyB, (tx) => getArtifactWithVersions(tx, id)),
    ).rejects.toMatchObject({ status: 404 });
  });
});
