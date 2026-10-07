// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MATCH_WEIGHTS,
  MATCH_WEIGHT_KEYS,
  type AgencyActor,
  type CriterionResult,
} from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { matchAnalyzePrompt } from '@/server/ai/prompts/match-analyze';
import { addDraftVersion, approveVersion, findOrCreateArtifact } from '@/server/artifacts/service';
import { createClient } from '@/server/clients/service';
import { addCandidateToPosition } from '@/server/pipeline/service';
import { createPosition, updatePosition } from '@/server/positions/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { createArtifact } from '@/server/artifacts/service';
import { analyzeEntry, planMatchAnalysis, type MatchRunner } from './analyze';

const profile = {
  fullName: 'Alex Kim',
  email: 'alex@x.com',
  phone: '+82 10-1234-5678',
  currentPosition: { title: 'HR Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'HR Director',
      start: '2019',
      end: null,
      current: true,
      summary: 'Managed a team of 20',
    },
  ],
  education: [],
  coreSkills: ['payroll'],
  industryExperience: [],
  technicalSkills: [],
  leadershipExperience: null,
  teamSize: '20',
  careerProgression: null,
  location: 'Seoul',
  workAuthorization: null,
  compensationExpectation: 'KRW 120M',
  majorAchievements: [],
  potentialMotivation: { text: 'Wants a bigger scope', evidence: [{ type: 'inferred' }] },
  potentialConcerns: [{ text: 'Short tenures', evidence: [{ type: 'inferred' }] }],
};
const successProfile = {
  summary: 'A senior HR leader',
  criteria: [
    { id: 'c1', text: '8 years in HR', category: 'must_have', basis: 'jd' },
    { id: 'c2', text: 'At a competitor', category: 'disqualifying', basis: 'intake' },
  ],
  expectations: { sixMonths: '', twelveMonths: '' },
  keyChallenges: [],
};
const criterion = (
  key: (typeof MATCH_WEIGHT_KEYS)[number],
  level: CriterionResult['level'],
  score: number,
): CriterionResult => ({
  key,
  level,
  score,
  summary: 's',
  evidence: [{ type: 'inferred' }],
  toConfirm: [],
});
const modelOutput = {
  criteria: [
    criterion('coreCompetencies', 'strong', 90),
    criterion('relevantExperience', 'strong', 80),
    criterion('industryFunctional', 'partial', 60),
    criterion('careerLevel', 'partial', 70),
    criterion('locationArrangement', 'gap', 20),
    criterion('educationCertification', 'strong', 100),
    criterion('compensationOther', 'unknown', 50),
  ],
  requirements: [{ criterionId: 'c1', status: 'met', evidence: [] }],
};

describe.skipIf(!dbAvailable())('match analysis (T-3-03, T-3-04)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyId: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn);

  /** A fake gateway: stores the draft the way the real one does, without calling a model. */
  const runner = (output: unknown = modelOutput): MatchRunner & ReturnType<typeof vi.fn> =>
    vi.fn(async (_purpose, input, ctx) => {
      const content = matchAnalyzePrompt.toContent!(matchAnalyzePrompt.schema.parse(output), input);
      const draft = await run(async (tx) => {
        const artifact = await findOrCreateArtifact(tx, {
          agencyId,
          kind: 'match_analysis',
          subject: ctx.subject!,
        });
        const version = await addDraftVersion(tx, {
          agencyId,
          artifactId: artifact.id,
          content,
          origin: 'ai',
          createdById: owner.userId,
        });
        return { artifactId: artifact.id, versionId: version.id, version: version.version };
      });
      return {
        generationId: randomUUID(),
        output,
        draft,
        usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
        costUsd: 0,
      };
    }) as never;

  const approve = async (
    kind: 'candidate_profile' | 'success_profile',
    subject: { type: 'candidate' | 'position'; id: string },
    content: unknown,
  ) => {
    const artifact = await run((tx) => createArtifact(tx, { agencyId, kind, subject }));
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content,
        origin: 'human',
        createdById: owner.userId,
      }),
    );
    await run((tx) => approveVersion(tx, owner, v.id));
    return v.id;
  };
  /** An entry whose candidate profile and position success profile are both approved. */
  const readyEntry = async (opts: { profile?: boolean; success?: boolean } = {}) => {
    const positionId = (
      await run((tx) =>
        createPosition(tx, owner, {
          clientId,
          title: 'Head of HR',
          location: 'Seoul',
          workArrangement: 'hybrid',
          compMin: 100,
          compMax: 130,
        }),
      )
    ).id;
    const candidateId = (
      await run((tx) =>
        tx.candidate.create({
          data: {
            agencyId,
            fullName: 'Alex Kim',
            source: 'linkedin',
            createdById: owner.userId,
            status: 'active',
          },
          select: { id: true },
        }),
      )
    ).id;
    const entry = await run((tx) => addCandidateToPosition(tx, owner, positionId, { candidateId }));
    const profileVersion =
      opts.profile === false
        ? null
        : await approve('candidate_profile', { type: 'candidate', id: candidateId }, profile);
    const successVersion =
      opts.success === false
        ? null
        : await approve('success_profile', { type: 'position', id: positionId }, successProfile);
    return { entry, positionId, candidateId, profileVersion, successVersion };
  };
  const deps = (run_: MatchRunner) => ({ run: run_, withAgency: run });

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyId = await createAgency(admin, 'Match A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyId, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, owner, { name: 'Match Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyId] });
    await admin.end();
    await handle.close();
  });

  describe('planning', () => {
    it('needs the candidate profile and the success profile to be approved, not just drafted', async () => {
      const noProfile = await readyEntry({ profile: false });
      await expect(
        run((tx) => planMatchAnalysis(tx, owner, noProfile.entry.id)),
      ).rejects.toMatchObject({ status: 409 });
      const noSuccess = await readyEntry({ success: false });
      await expect(
        run((tx) => planMatchAnalysis(tx, owner, noSuccess.entry.id)),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('records which approved versions it compares and uses the position weights', async () => {
      const ready = await readyEntry();
      const plan = await run((tx) => planMatchAnalysis(tx, owner, ready.entry.id));
      expect(plan.inputRefs).toMatchObject({
        entryId: ready.entry.id,
        candidateProfileVersionId: ready.profileVersion,
        successProfileVersionId: ready.successVersion,
      });
      expect(plan.weights).toEqual(DEFAULT_MATCH_WEIGHTS);
      expect(plan.input.position).toEqual({
        title: 'Head of HR',
        location: 'Seoul',
        workArrangement: 'hybrid',
        compensation: '100-130 USD',
      });
    });

    it('sends the model no name, no contact details and none of the AI guesses about motivation or concerns', async () => {
      const ready = await readyEntry();
      const plan = await run((tx) => planMatchAnalysis(tx, owner, ready.entry.id));
      const sent = JSON.stringify(plan.input);
      expect(sent).not.toMatch(
        /Alex|alex@x\.com|1234-5678|fullName|potentialMotivation|potentialConcerns|bigger scope|Short tenures/,
      );
      expect(plan.input.candidate.compensationExpectation).toBe('KRW 120M');
    });

    it('is for the entry owner, a lead or an admin', async () => {
      const ready = await readyEntry();
      await expect(run((tx) => planMatchAnalysis(tx, other, ready.entry.id))).rejects.toMatchObject(
        { status: 403 },
      );
    });
  });

  describe('running the analysis', () => {
    it('stores a draft and the read model with the criterion scores, weights and the overall computed in code', async () => {
      const ready = await readyEntry();
      const fake = runner();
      const result = await analyzeEntry(deps(fake), owner, ready.entry.id);
      expect(fake).toHaveBeenCalledWith(
        'match.analyze',
        expect.anything(),
        expect.objectContaining({
          subject: { type: 'pipeline_entry', id: ready.entry.id },
          positionId: ready.positionId,
        }),
      );
      // relevantExperience 'strong' 80 is brought up to 85 (the strong band): 3600+1700+900+700+100+500+250 = 7750
      expect(result.overallScore).toBe(78);
      const row = await admin.query(
        `SELECT "overallScore", weights, "criterionScores", "profileVersionId", "successProfileVersionId", "versionId", stale, "recruiterAssessment", "overrideScore" FROM "MatchAnalysis" WHERE id = $1`,
        [result.id],
      );
      expect(row.rows[0]).toMatchObject({
        overallScore: 78,
        weights: DEFAULT_MATCH_WEIGHTS,
        profileVersionId: ready.profileVersion,
        successProfileVersionId: ready.successVersion,
        versionId: result.versionId,
        stale: false,
        recruiterAssessment: null,
        overrideScore: null,
      });
      expect(row.rows[0].criterionScores.coreCompetencies).toEqual({ level: 'strong', score: 90 });
      expect(row.rows[0].criterionScores.compensationOther).toEqual({
        level: 'unknown',
        score: 50,
      });
    });

    it('uses the position weights, so the same answer scores differently on another position', async () => {
      const ready = await readyEntry();
      await run((tx) =>
        updatePosition(tx, owner, ready.positionId, {
          matchingWeights: {
            ...DEFAULT_MATCH_WEIGHTS,
            coreCompetencies: 20,
            locationArrangement: 25,
          },
        }),
      );
      const result = await analyzeEntry(deps(runner()), owner, ready.entry.id);
      expect(result.overallScore).toBeLessThan(78);
    });

    it('leaves the draft unreviewed: nothing downstream may use it yet, and nothing is moved', async () => {
      const ready = await readyEntry();
      const result = await analyzeEntry(deps(runner()), owner, ready.entry.id);
      const version = await admin.query(
        `SELECT status, origin FROM "ArtifactVersion" WHERE id = $1`,
        [result.versionId],
      );
      expect(version.rows[0]).toEqual({ status: 'draft', origin: 'ai' });
      expect(
        (await run((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ready.entry.id } })))
          .state,
      ).toBe('sourced');
    });

    it('keeps one row per run, newest last, and logs the analysis on both timelines', async () => {
      const ready = await readyEntry();
      const first = await analyzeEntry(deps(runner()), owner, ready.entry.id);
      const second = await analyzeEntry(deps(runner()), owner, ready.entry.id);
      expect(second.artifactId).toBe(first.artifactId);
      expect(second.versionId).not.toBe(first.versionId);
      const rows = await admin.query(
        `SELECT count(*)::int AS n FROM "MatchAnalysis" WHERE "entryId" = $1`,
        [ready.entry.id],
      );
      expect(rows.rows[0].n).toBe(2);
      const log = await admin.query(
        `SELECT "entityType" FROM "ActivityLog" WHERE action = 'match.analyzed' AND data->>'entryId' = $1 ORDER BY "entityType"`,
        [ready.entry.id],
      );
      expect(log.rows.map((r) => r.entityType)).toEqual([
        'candidate',
        'candidate',
        'position',
        'position',
      ]);
    });

    it('saves nothing when the model call fails', async () => {
      const ready = await readyEntry();
      const failing = vi.fn(async () => {
        throw new Error('model unavailable');
      }) as unknown as MatchRunner;
      await expect(analyzeEntry(deps(failing), owner, ready.entry.id)).rejects.toThrow(
        'model unavailable',
      );
      const rows = await admin.query(
        `SELECT count(*)::int AS n FROM "MatchAnalysis" WHERE "entryId" = $1`,
        [ready.entry.id],
      );
      expect(rows.rows[0].n).toBe(0);
    });
  });

  describe('changing the weights (T-3-04)', () => {
    it('recomputes the overall score of every analysis of the position at once, with no new analysis and no stale marker', async () => {
      const ready = await readyEntry();
      const before = await analyzeEntry(deps(runner()), owner, ready.entry.id);
      const calls = (await admin.query(`SELECT count(*)::int AS n FROM "AiGeneration"`)).rows[0].n;
      const weights = {
        ...DEFAULT_MATCH_WEIGHTS,
        coreCompetencies: 10,
        educationCertification: 35,
      };
      await run((tx) => updatePosition(tx, owner, ready.positionId, { matchingWeights: weights }));
      const row = await admin.query(
        `SELECT "overallScore", weights, stale FROM "MatchAnalysis" WHERE id = $1`,
        [before.id],
      );
      // 10*90 + 20*85 + 15*60 + 10*70 + 5*20 + 35*100 + 5*50 = 900+1700+900+700+100+3500+250 = 8050
      expect(row.rows[0]).toMatchObject({ overallScore: 81, weights, stale: false });
      expect(before.overallScore).toBe(78);
      expect((await admin.query(`SELECT count(*)::int AS n FROM "AiGeneration"`)).rows[0].n).toBe(
        calls,
      );
    });

    it('counts a recruiter override of a criterion in the recomputed score', async () => {
      const ready = await readyEntry();
      const before = await analyzeEntry(deps(runner()), owner, ready.entry.id);
      await admin.query(
        `UPDATE "MatchAnalysis" SET "criterionOverrides" = $2::jsonb WHERE id = $1`,
        [
          before.id,
          JSON.stringify([
            {
              key: 'coreCompetencies',
              original: 90,
              score: 50,
              reason: 'Interview',
              byId: owner.userId,
              at: new Date().toISOString(),
            },
          ]),
        ],
      );
      await run((tx) =>
        updatePosition(tx, owner, ready.positionId, { matchingWeights: DEFAULT_MATCH_WEIGHTS }),
      );
      // 40*50 + 20*85 + 15*60 + 10*70 + 5*20 + 5*100 + 5*50 = 2000+1700+900+700+100+500+250 = 6150
      const row = await admin.query(`SELECT "overallScore" FROM "MatchAnalysis" WHERE id = $1`, [
        before.id,
      ]);
      expect(row.rows[0].overallScore).toBe(62);
    });

    it('is marked stale only when the candidate profile or the success profile gets a new approved version', async () => {
      const ready = await readyEntry();
      const result = await analyzeEntry(deps(runner()), owner, ready.entry.id);
      await run((tx) =>
        updatePosition(tx, owner, ready.positionId, {
          matchingWeights: {
            ...DEFAULT_MATCH_WEIGHTS,
            coreCompetencies: 35,
            relevantExperience: 25,
          },
        }),
      );
      expect(
        (await admin.query(`SELECT stale FROM "MatchAnalysis" WHERE id = $1`, [result.id])).rows[0]
          .stale,
      ).toBe(false);
      await approve(
        'success_profile',
        { type: 'position', id: ready.positionId },
        { ...successProfile, summary: 'Changed' },
      ).catch(async () => {
        // A second approval of the same artifact: add a version to the existing artifact.
        const art = await run((tx) =>
          tx.artifact.findFirstOrThrow({
            where: { kind: 'success_profile', subjectId: ready.positionId },
          }),
        );
        const v = await run((tx) =>
          addDraftVersion(tx, {
            agencyId,
            artifactId: art.id,
            content: { ...successProfile, summary: 'Changed' },
            origin: 'human',
            createdById: owner.userId,
          }),
        );
        await run((tx) => approveVersion(tx, owner, v.id));
      });
      expect(
        (await admin.query(`SELECT stale FROM "MatchAnalysis" WHERE id = $1`, [result.id])).rows[0]
          .stale,
      ).toBe(true);
    });
  });
});
