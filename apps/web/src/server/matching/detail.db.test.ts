// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { fakeMatchRunner, readyMatchEntry } from '@/test/match-fixtures';
import { analyzeEntry } from './analyze';
import { getAnalysisDetail, getReviewedAnalysis, markReviewed } from './detail';
import { overrideScore, saveAssessment } from './overrides';

describe.skipIf(!dbAvailable())('analysis detail and mark reviewed (T-3-09, T-3-11)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let owner: AgencyActor;
  let other: AgencyActor;
  let outsider: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  const analysis = async () => {
    const ready = await readyMatchEntry(run, owner, clientId);
    const result = await analyzeEntry(
      { run: fakeMatchRunner(run, agencyA, owner.userId), withAgency: run },
      owner,
      ready.entry.id,
    );
    return { ...ready, analysisId: result.id, versionId: result.versionId };
  };
  const setExplainOnly = (value: boolean) =>
    admin.query(
      `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{explainOnly}', $2::jsonb) WHERE id = $1`,
      [agencyA, JSON.stringify(value)],
    );

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Detail A');
    agencyB = await createAgency(admin, 'Detail B');
    const [u1, u2, u3] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter', true, now())`,
        [agencyA, u],
      );
    }
    owner = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId: agencyA, role: 'recruiter' };
    outsider = { kind: 'agency', userId: u3, agencyId: agencyB, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, owner, { name: 'Detail Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  describe('detail', () => {
    it('shows the seven criteria with their evidence, the must-have statuses with the success profile wording, and the versions compared', async () => {
      const a = await analysis();
      const detail = await run((tx) => getAnalysisDetail(tx, owner, a.analysisId));
      expect(detail.criteria.map((c) => c.key)).toHaveLength(7);
      expect(detail.criteria[0]).toMatchObject({
        key: 'coreCompetencies',
        level: 'strong',
        score: 90,
        computedScore: 90,
        overridden: false,
      });
      expect(detail.requirements).toEqual([
        {
          criterionId: 'c1',
          text: '8 years in HR',
          category: 'must_have',
          status: 'met',
          evidence: [],
        },
      ]);
      expect(detail.strengths.length).toBeGreaterThan(0);
      expect(detail.gaps.map((g) => g.key)).toContain('locationArrangement');
      expect(detail.toConfirm).toEqual([]);
      expect(detail.reviewed).toBe(false);
      expect(detail.basis).toMatchObject({
        candidateProfileVersionId: expect.any(String),
        successProfileVersionId: expect.any(String),
      });
      expect(detail.analysis).toMatchObject({
        overall: 78,
        computedOverall: 78,
        overridden: false,
        stale: false,
        recruiterAssessment: null,
      });
    });

    it('shows overrides with their reasons next to the computed values, and the recruiter’s assessment', async () => {
      const a = await analysis();
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'coreCompetencies',
          score: 50,
          reason: 'Less depth',
        }),
      );
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'overall',
          score: 55,
          reason: 'Overall view',
        }),
      );
      await run((tx) => saveAssessment(tx, owner, a.analysisId, { text: 'Verify pay.' }));
      const detail = await run((tx) => getAnalysisDetail(tx, owner, a.analysisId));
      expect(detail.criteria[0]).toMatchObject({
        score: 50,
        computedScore: 90,
        overridden: true,
        overrideReason: 'Less depth',
      });
      expect(detail.analysis).toMatchObject({
        overall: 55,
        computedOverall: 62,
        overridden: true,
        overrideReason: 'Overall view',
        recruiterAssessment: 'Verify pay.',
      });
    });

    it('hides every number in explain-only mode but keeps levels, evidence and reasons', async () => {
      const a = await analysis();
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'coreCompetencies',
          score: 50,
          reason: 'Less depth',
        }),
      );
      await setExplainOnly(true);
      try {
        const detail = await run((tx) => getAnalysisDetail(tx, owner, a.analysisId));
        expect(detail.explainOnly).toBe(true);
        expect(detail.analysis.overall).toBeNull();
        expect(detail.criteria.every((c) => c.score === null && c.computedScore === null)).toBe(
          true,
        );
        expect(detail.criteria[0]).toMatchObject({
          level: 'strong',
          overridden: true,
          overrideReason: 'Less depth',
        });
      } finally {
        await setExplainOnly(false);
      }
    });

    it('is readable by anyone who can see the position, and not across agencies', async () => {
      const a = await analysis();
      expect((await run((tx) => getAnalysisDetail(tx, other, a.analysisId))).analysis.id).toBe(
        a.analysisId,
      );
      await expect(
        appScope(handle).withAgency(agencyB, (tx) => getAnalysisDetail(tx, outsider, a.analysisId)),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('mark reviewed (FR-AI-02)', () => {
    it('approves the analysis, and only then may later steps use it', async () => {
      const a = await analysis();
      expect(await run((tx) => getReviewedAnalysis(tx, a.entry.id))).toBeNull(); // a draft feeds nothing
      await run((tx) => markReviewed(tx, owner, a.analysisId));
      const reviewed = await run((tx) => getReviewedAnalysis(tx, a.entry.id));
      expect(reviewed!.analysis.id).toBe(a.analysisId);
      expect(reviewed!.content.criteria).toHaveLength(7);
      expect((await run((tx) => getAnalysisDetail(tx, owner, a.analysisId))).reviewed).toBe(true);
    });

    it('is harmless when repeated, and logs it once on both timelines', async () => {
      const a = await analysis();
      await run((tx) => markReviewed(tx, owner, a.analysisId));
      await run((tx) => markReviewed(tx, owner, a.analysisId));
      const log = await admin.query(
        `SELECT "entityType" FROM "ActivityLog" WHERE action = 'match.reviewed' AND data->>'analysisId' = $1 ORDER BY "entityType"`,
        [a.analysisId],
      );
      expect(log.rows.map((r) => r.entityType)).toEqual(['candidate', 'position']);
    });

    it('keeps using the reviewed analysis while a newer run waits for review, and switches when that one is reviewed', async () => {
      const a = await analysis();
      await run((tx) => markReviewed(tx, owner, a.analysisId));
      const newer = await analyzeEntry(
        { run: fakeMatchRunner(run, agencyA, owner.userId), withAgency: run },
        owner,
        a.entry.id,
      );
      expect((await run((tx) => getReviewedAnalysis(tx, a.entry.id)))!.analysis.id).toBe(
        a.analysisId,
      );
      await run((tx) => markReviewed(tx, owner, newer.id));
      expect((await run((tx) => getReviewedAnalysis(tx, a.entry.id)))!.analysis.id).toBe(newer.id);
      // The first one was replaced by the newer reviewed one: it cannot be marked reviewed again.
      await expect(run((tx) => markReviewed(tx, owner, a.analysisId))).rejects.toMatchObject({
        status: 409,
      });
    });

    it('is for the entry owner, a lead or an admin', async () => {
      const a = await analysis();
      await expect(run((tx) => markReviewed(tx, other, a.analysisId))).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        appScope(handle).withAgency(agencyB, (tx) => markReviewed(tx, outsider, a.analysisId)),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});
