// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { approveVersion } from '@/server/artifacts/service';
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
import { fakeMatchRunner, matchModelOutput, readyMatchEntry } from '@/test/match-fixtures';
import { analyzeEntry } from './analyze';
import { getDashboard, setManualOrder } from './dashboard';
import { overrideScore, saveAssessment } from './overrides';

describe.skipIf(!dbAvailable())('review dashboard (T-3-07, T-3-10)', () => {
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

  /** A position with candidates; `scores` is the level of core competencies each gets, so each gets a different overall. */
  const board = async (names: string[]) => {
    const positionId = (
      await run((tx) =>
        createPosition(tx, owner, { clientId, title: 'Board Role', location: 'Seoul' }),
      )
    ).id;
    const entries: { id: string; name: string; candidateId: string }[] = [];
    for (const name of names) {
      const e = await readyMatchEntry(run, owner, clientId, { positionId });
      await run((tx) =>
        tx.candidate.update({ where: { id: e.candidateId }, data: { fullName: name } }),
      );
      entries.push({ id: e.entry.id, name, candidateId: e.candidateId });
    }
    return { positionId, entries };
  };
  const analyze = (
    entryId: string,
    coreScore = 90,
    level: 'strong' | 'partial' | 'gap' = 'strong',
  ) =>
    analyzeEntry(
      {
        run: fakeMatchRunner(run, agencyA, owner.userId, {
          ...matchModelOutput,
          criteria: matchModelOutput.criteria.map((c) =>
            c.key === 'coreCompetencies' ? { ...c, level, score: coreScore } : c,
          ),
        }),
        withAgency: run,
      },
      owner,
      entryId,
    );
  const setExplainOnly = (value: boolean) =>
    admin.query(
      `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{explainOnly}', $2::jsonb) WHERE id = $1`,
      [agencyA, JSON.stringify(value)],
    );

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Board A');
    agencyB = await createAgency(admin, 'Board B');
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
    clientId = (await run((tx) => createClient(tx, owner, { name: 'Board Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('lists everyone in the pipeline, analyzed or not, and hides nobody because of a score', async () => {
    const { positionId, entries } = await board(['Ann', 'Ben', 'Cho']);
    await analyze(entries[0]!.id, 40, 'gap'); // a low score
    const dash = await run((tx) => getDashboard(tx, owner, positionId));
    expect(dash.rows.map((r) => r.candidateName).sort()).toEqual(['Ann', 'Ben', 'Cho']);
    expect(dash.rows.find((r) => r.candidateName === 'Ben')!.analysis).toBeNull();
  });

  it('suggests the review order: highest shown score first, then not analyzed yet, then by name', async () => {
    const { positionId, entries } = await board(['Zoe', 'Yan', 'Xia', 'Wes']);
    await analyze(entries[0]!.id, 95, 'strong'); // Zoe high
    await analyze(entries[1]!.id, 30, 'gap'); // Yan low
    await analyze(entries[2]!.id, 70, 'partial'); // Xia middle
    const dash = await run((tx) => getDashboard(tx, owner, positionId));
    expect(dash.rows.map((r) => r.candidateName)).toEqual(['Zoe', 'Xia', 'Yan', 'Wes']);
    expect(dash.rows[0]!.analysis!.overall!).toBeGreaterThan(dash.rows[1]!.analysis!.overall!);
  });

  it('shows the dashboard columns: criterion levels and scores, requirement counts, strengths and gaps', async () => {
    const { positionId, entries } = await board(['Dee']);
    await analyze(entries[0]!.id);
    const row = (await run((tx) => getDashboard(tx, owner, positionId))).rows[0]!;
    expect(row.analysis!.criteria.coreCompetencies).toEqual({
      level: 'strong',
      score: 90,
      overridden: false,
    });
    expect(row.analysis!.criteria.compensationOther).toEqual({
      level: 'unknown',
      score: 50,
      overridden: false,
    });
    expect(row.analysis!.summary!.requirements.mustHave).toEqual({
      met: 1,
      not_met: 0,
      unknown: 0,
    });
    expect(row.analysis!.summary!.strengths.length).toBeGreaterThan(0);
    expect(row.analysis!.summary!.gaps.map((g) => g.key)).toContain('locationArrangement');
    expect(row.analysis).toMatchObject({
      overridden: false,
      stale: false,
      reviewed: false,
      hasAssessment: false,
      assessmentPreview: null,
    });
  });

  it('shows an override as the shown score, marks it, and keeps the computed one', async () => {
    const { positionId, entries } = await board(['Eli', 'Fay']);
    const a = await analyze(entries[0]!.id, 90, 'strong');
    await analyze(entries[1]!.id, 90, 'strong');
    await run((tx) =>
      overrideScore(tx, owner, a.id, {
        kind: 'overall',
        score: 20,
        reason: 'Interview went badly',
      }),
    );
    await run((tx) =>
      overrideScore(tx, owner, a.id, {
        kind: 'criterion',
        key: 'coreCompetencies',
        score: 40,
        reason: 'Less depth',
      }),
    );
    const dash = await run((tx) => getDashboard(tx, owner, positionId));
    const eli = dash.rows.find((r) => r.candidateName === 'Eli')!;
    expect(eli.analysis).toMatchObject({ overall: 20, overridden: true });
    expect(eli.analysis!.computedOverall).toBeGreaterThan(20);
    expect(eli.analysis!.criteria.coreCompetencies).toMatchObject({
      score: 40,
      overridden: true,
      level: 'strong',
    });
    expect(dash.rows.map((r) => r.candidateName)).toEqual(['Fay', 'Eli']); // the override moves the suggested order
  });

  it('shows a preview of the recruiter’s assessment', async () => {
    const { positionId, entries } = await board(['Gus']);
    const a = await analyze(entries[0]!.id);
    await run((tx) =>
      saveAssessment(tx, owner, a.id, { text: 'Strong functional fit. '.repeat(20) }),
    );
    const row = (await run((tx) => getDashboard(tx, owner, positionId))).rows[0]!;
    expect(row.analysis!.hasAssessment).toBe(true);
    expect(row.analysis!.assessmentPreview!.endsWith('…')).toBe(true);
    expect(row.analysis!.assessmentPreview!.length).toBeLessThanOrEqual(161);
  });

  it('marks an analysis reviewed once its draft is approved, and stale when a profile changed', async () => {
    const { positionId, entries } = await board(['Hal']);
    const a = await analyze(entries[0]!.id);
    await run((tx) => approveVersion(tx, owner, a.versionId));
    await admin.query(`UPDATE "MatchAnalysis" SET stale = true WHERE id = $1`, [a.id]);
    const row = (await run((tx) => getDashboard(tx, owner, positionId))).rows[0]!;
    expect(row.analysis).toMatchObject({ reviewed: true, stale: true });
  });

  it('uses the newest analysis of a candidate', async () => {
    const { positionId, entries } = await board(['Ivy']);
    await analyze(entries[0]!.id, 95, 'strong');
    const second = await analyze(entries[0]!.id, 30, 'gap');
    const row = (await run((tx) => getDashboard(tx, owner, positionId))).rows[0]!;
    expect(row.analysis!.id).toBe(second.id);
  });

  describe('explain-only mode (ADR-007, Q-06)', () => {
    it('hides every number but keeps the levels, the order and the markers', async () => {
      const { positionId, entries } = await board(['Jon', 'Kim']);
      const a = await analyze(entries[0]!.id, 95, 'strong');
      await analyze(entries[1]!.id, 30, 'gap');
      await run((tx) =>
        overrideScore(tx, owner, a.id, {
          kind: 'criterion',
          key: 'coreCompetencies',
          score: 88,
          reason: 'Checked references',
        }),
      );
      await setExplainOnly(true);
      try {
        const dash = await run((tx) => getDashboard(tx, owner, positionId));
        expect(dash.explainOnly).toBe(true);
        expect(dash.rows.map((r) => r.candidateName)).toEqual(['Jon', 'Kim']); // still suggested in score order
        for (const row of dash.rows) {
          expect(row.analysis!.overall).toBeNull();
          expect(row.analysis!.computedOverall).toBeNull();
          expect(
            Object.values(row.analysis!.criteria).every(
              (c) => c.score === null && typeof c.level === 'string',
            ),
          ).toBe(true);
        }
        expect(dash.rows[0]!.analysis!.criteria.coreCompetencies).toEqual({
          level: 'strong',
          score: null,
          overridden: true,
        });
        expect(JSON.stringify(dash)).not.toMatch(/"score":\s*\d/);
      } finally {
        await setExplainOnly(false);
      }
    });
  });

  describe("the recruiter's order", () => {
    it('puts the chosen candidates first in the given order, whatever their scores, and keeps the rest in suggested order', async () => {
      const { positionId, entries } = await board(['Lee', 'Mia', 'Ned']);
      await analyze(entries[0]!.id, 95, 'strong');
      await analyze(entries[1]!.id, 70, 'partial');
      await analyze(entries[2]!.id, 30, 'gap');
      await run((tx) => setManualOrder(tx, owner, positionId, [entries[2]!.id, entries[0]!.id]));
      const dash = await run((tx) => getDashboard(tx, owner, positionId));
      expect(dash.rows.map((r) => [r.candidateName, r.manualRank])).toEqual([
        ['Ned', 1],
        ['Lee', 2],
        ['Mia', null],
      ]);
    });

    it('can be reset to the suggested order, and replaced by a new order', async () => {
      const { positionId, entries } = await board(['Oli', 'Pam']);
      await analyze(entries[0]!.id, 95, 'strong');
      await analyze(entries[1]!.id, 30, 'gap');
      await run((tx) => setManualOrder(tx, owner, positionId, [entries[1]!.id, entries[0]!.id]));
      await run((tx) => setManualOrder(tx, owner, positionId, [entries[0]!.id]));
      expect(
        (await run((tx) => getDashboard(tx, owner, positionId))).rows.map((r) => [
          r.candidateName,
          r.manualRank,
        ]),
      ).toEqual([
        ['Oli', 1],
        ['Pam', null],
      ]);
      await run((tx) => setManualOrder(tx, owner, positionId, []));
      expect(
        (await run((tx) => getDashboard(tx, owner, positionId))).rows.every(
          (r) => r.manualRank === null,
        ),
      ).toBe(true);
    });

    it('refuses a candidate that is not in the position or a repeated one (422)', async () => {
      const { positionId, entries } = await board(['Quin']);
      const elsewhere = await board(['Rob']);
      await expect(
        run((tx) => setManualOrder(tx, owner, positionId, [elsewhere.entries[0]!.id])),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        run((tx) => setManualOrder(tx, owner, positionId, [entries[0]!.id, entries[0]!.id])),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('is for the position owner, a lead or an admin', async () => {
      const { positionId, entries } = await board(['Sue']);
      await expect(
        run((tx) => setManualOrder(tx, other, positionId, [entries[0]!.id])),
      ).rejects.toMatchObject({ status: 403 });
      expect((await run((tx) => getDashboard(tx, other, positionId))).rows).toHaveLength(1); // reading is open
    });
  });

  it('does not reach another agency', async () => {
    const { positionId } = await board(['Tia']);
    await expect(
      appScope(handle).withAgency(agencyB, (tx) => getDashboard(tx, outsider, positionId)),
    ).rejects.toMatchObject({ status: 404 });
  });
});
