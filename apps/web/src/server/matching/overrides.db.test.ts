// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_WEIGHTS, type AgencyActor } from '@easemuse/core';
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
import { getLatestAnalysis, overrideScore, saveAssessment } from './overrides';

describe.skipIf(!dbAvailable())('overrides and the recruiter assessment (T-3-06)', () => {
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
  /** A finished analysis: overall 78 with the default weights (see analyze.db.test.ts for the arithmetic). */
  const analysis = async () => {
    const ready = await readyMatchEntry(run, owner, clientId);
    const result = await analyzeEntry(
      { run: fakeMatchRunner(run, agencyA, owner.userId), withAgency: run },
      owner,
      ready.entry.id,
    );
    return { ...ready, analysisId: result.id };
  };
  const row = (id: string) =>
    admin.query(`SELECT * FROM "MatchAnalysis" WHERE id = $1`, [id]).then((r) => r.rows[0]);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Override A');
    agencyB = await createAgency(admin, 'Override B');
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
    clientId = (await run((tx) => createClient(tx, owner, { name: 'Override Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  describe('overall score', () => {
    it('keeps the computed score and stores the override and its reason beside it', async () => {
      const a = await analysis();
      const view = await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'overall',
          score: 65,
          reason: 'Interview showed less depth',
        }),
      );
      expect(view).toMatchObject({
        overallScore: 78,
        overrideScore: 65,
        overrideReason: 'Interview showed less depth',
      });
      expect(await row(a.analysisId)).toMatchObject({ overallScore: 78, overrideScore: 65 });
    });

    it('can be changed again and removed, returning to the computed score; every change is on the timeline', async () => {
      const a = await analysis();
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'overall',
          score: 65,
          reason: 'First view',
        }),
      );
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'overall',
          score: 70,
          reason: 'After the second call',
        }),
      );
      const cleared = await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'overall',
          score: null,
          reason: 'Back to the computed score',
        }),
      );
      expect(cleared).toMatchObject({
        overrideScore: null,
        overrideReason: null,
        overallScore: 78,
      });
      const log = await admin.query(
        `SELECT action, data FROM "ActivityLog" WHERE "entityType" = 'position' AND "entityId" = $1 AND data->>'analysisId' = $2 AND action IN ('match.overridden', 'match.override_removed') ORDER BY "createdAt", id`,
        [a.positionId, a.analysisId],
      );
      expect(log.rows.map((r) => [r.action, r.data.from, r.data.to])).toEqual([
        ['match.overridden', null, 65],
        ['match.overridden', 65, 70],
        ['match.override_removed', 70, null],
      ]);
      expect(log.rows[1].data).toMatchObject({ computed: 78, reason: 'After the second call' });
    });

    it('says so (409) when there is no override to remove', async () => {
      const a = await analysis();
      await expect(
        run((tx) =>
          overrideScore(tx, owner, a.analysisId, {
            kind: 'overall',
            score: null,
            reason: 'Nothing to remove',
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('one criterion', () => {
    it('keeps the original score, and the overall is recomputed with the override counted', async () => {
      const a = await analysis();
      const view = await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'coreCompetencies',
          score: 50,
          reason: 'Interview showed less depth',
        }),
      );
      expect(view.criterionOverrides).toEqual([
        expect.objectContaining({
          key: 'coreCompetencies',
          original: 90,
          score: 50,
          reason: 'Interview showed less depth',
          byId: owner.userId,
        }),
      ]);
      expect(view.criterionScores.coreCompetencies.score).toBe(90); // the computed value is untouched
      // 40*50 + 20*85 + 15*60 + 10*70 + 5*20 + 5*100 + 5*50 = 6150
      expect(view.overallScore).toBe(62);
    });

    it('replaces an earlier override of the same criterion and keeps the true original', async () => {
      const a = await analysis();
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'coreCompetencies',
          score: 50,
          reason: 'First view',
        }),
      );
      const view = await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'coreCompetencies',
          score: 70,
          reason: 'Second view',
        }),
      );
      expect(view.criterionOverrides).toHaveLength(1);
      expect(view.criterionOverrides[0]).toMatchObject({
        original: 90,
        score: 70,
        reason: 'Second view',
      });
    });

    it('removing it restores the computed overall', async () => {
      const a = await analysis();
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'careerLevel',
          score: 20,
          reason: 'Too junior',
        }),
      );
      const view = await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'careerLevel',
          score: null,
          reason: 'Reconsidered',
        }),
      );
      expect(view).toMatchObject({ criterionOverrides: [], overallScore: 78 });
    });

    it('refuses a no-op, and removing what is not there', async () => {
      const a = await analysis();
      await expect(
        run((tx) =>
          overrideScore(tx, owner, a.analysisId, {
            kind: 'criterion',
            key: 'coreCompetencies',
            score: 90,
            reason: 'Same as computed',
          }),
        ),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        run((tx) =>
          overrideScore(tx, owner, a.analysisId, {
            kind: 'criterion',
            key: 'coreCompetencies',
            score: null,
            reason: 'Nothing to remove',
          }),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('stays correct when the weights change afterwards', async () => {
      const a = await analysis();
      await run((tx) =>
        overrideScore(tx, owner, a.analysisId, {
          kind: 'criterion',
          key: 'coreCompetencies',
          score: 50,
          reason: 'Interview showed less depth',
        }),
      );
      const { updatePosition } = await import('@/server/positions/service');
      await run((tx) =>
        updatePosition(tx, owner, a.positionId, {
          matchingWeights: {
            ...DEFAULT_MATCH_WEIGHTS,
            coreCompetencies: 10,
            educationCertification: 35,
          },
        }),
      );
      // 10*50 + 20*85 + 15*60 + 10*70 + 5*20 + 35*100 + 5*50 = 500+1700+900+700+100+3500+250 = 7650
      expect((await row(a.analysisId)).overallScore).toBe(77);
    });
  });

  describe("the recruiter's assessment", () => {
    it('is saved as the person’s own text, can be changed, and cleared with empty text', async () => {
      const a = await analysis();
      expect(
        (
          await run((tx) =>
            saveAssessment(tx, owner, a.analysisId, { text: 'Strong functional fit.' }),
          )
        ).recruiterAssessment,
      ).toBe('Strong functional fit.');
      expect(
        (
          await run((tx) =>
            saveAssessment(tx, owner, a.analysisId, { text: 'Strong fit; verify pay.' }),
          )
        ).recruiterAssessment,
      ).toBe('Strong fit; verify pay.');
      expect(
        (await run((tx) => saveAssessment(tx, owner, a.analysisId, { text: '' })))
          .recruiterAssessment,
      ).toBeNull();
    });

    it('is never filled by an analysis run: a new run starts without one', async () => {
      const a = await analysis();
      await run((tx) => saveAssessment(tx, owner, a.analysisId, { text: 'Mine.' }));
      const rerun = await analyzeEntry(
        { run: fakeMatchRunner(run, agencyA, owner.userId), withAgency: run },
        owner,
        a.entry.id,
      );
      expect((await row(rerun.id)).recruiterAssessment).toBeNull();
      expect((await row(a.analysisId)).recruiterAssessment).toBe('Mine.');
    });
  });

  describe('who may do it', () => {
    it('is the entry owner, a lead or an admin; another recruiter gets 403, and can still read it', async () => {
      const a = await analysis();
      await expect(
        run((tx) =>
          overrideScore(tx, other, a.analysisId, {
            kind: 'overall',
            score: 60,
            reason: 'Not mine to change',
          }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        run((tx) => saveAssessment(tx, other, a.analysisId, { text: 'Not mine' })),
      ).rejects.toMatchObject({ status: 403 });
      expect((await run((tx) => getLatestAnalysis(tx, other, a.entry.id)))?.id).toBe(a.analysisId);
    });

    it('does not reach another agency', async () => {
      const a = await analysis();
      await expect(
        appScope(handle).withAgency(agencyB, (tx) =>
          overrideScore(tx, outsider, a.analysisId, {
            kind: 'overall',
            score: 60,
            reason: 'Not yours',
          }),
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        appScope(handle).withAgency(agencyB, (tx) => getLatestAnalysis(tx, outsider, a.entry.id)),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('returns null before the first analysis', async () => {
      const ready = await readyMatchEntry(run, owner, clientId);
      expect(await run((tx) => getLatestAnalysis(tx, owner, ready.entry.id))).toBeNull();
    });
  });
});
