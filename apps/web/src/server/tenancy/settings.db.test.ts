// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_WEIGHTS, DEFAULT_REJECTION_REASONS, type AgencyActor } from '@easemuse/core';
import { closeDb } from '@/lib/db';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import type { DbHandle } from '@/lib/db/client';
import { getAgencyUsage, monthRange } from './agency-usage';
import { readSettings, updateSettings } from './settings';

describe.skipIf(!dbAvailable())('agency settings and usage (T-13-04, T-13-05)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let actorA: AgencyActor;
  let actorB: AgencyActor;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Settings A');
    agencyB = await createAgency(admin, 'Settings B');
    actorA = { kind: 'agency', userId: randomUUID(), agencyId: agencyA, role: 'admin' };
    actorB = { kind: 'agency', userId: randomUUID(), agencyId: agencyB, role: 'admin' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
    await closeDb();
  });

  describe('settings', () => {
    it('reads defaults for an agency that never saved any', async () => {
      const s = await readSettings(actorA);
      expect(s.defaultMatchingWeights).toEqual(DEFAULT_MATCH_WEIGHTS);
      expect(s.outreachIntervalsDays).toEqual([4, 7]);
      expect(s.rejectionReasons).toEqual([...DEFAULT_REJECTION_REASONS]);
    });

    it('applies a patch, keeps other settings, and logs the keys changed', async () => {
      const updated = await updateSettings(actorA, {
        recentlyContactedDays: 14,
        visibility: 'own_and_shared',
      });
      expect(updated).toMatchObject({
        recentlyContactedDays: 14,
        visibility: 'own_and_shared',
        outreachIntervalsDays: [4, 7],
      });
      expect(await readSettings(actorA)).toMatchObject({
        recentlyContactedDays: 14,
        visibility: 'own_and_shared',
      });
      await updateSettings(actorA, { outreachIntervalsDays: [3, 5] });
      expect(await readSettings(actorA)).toMatchObject({
        recentlyContactedDays: 14,
        outreachIntervalsDays: [3, 5],
      });
      const log = (
        await admin.query(
          `SELECT data FROM "ActivityLog" WHERE "agencyId" = $1 AND action = 'settings.updated' ORDER BY "createdAt"`,
          [agencyA],
        )
      ).rows;
      expect(log.map((r) => r.data.keys)).toEqual([
        ['recentlyContactedDays', 'visibility'],
        ['outreachIntervalsDays'],
      ]);
    });

    it('stores new weights only when they add up to 100', async () => {
      const weights = { ...DEFAULT_MATCH_WEIGHTS, coreCompetencies: 50, relevantExperience: 10 };
      expect(
        (await updateSettings(actorA, { defaultMatchingWeights: weights })).defaultMatchingWeights,
      ).toEqual(weights);
      await expect(
        updateSettings(actorA, {
          defaultMatchingWeights: { ...DEFAULT_MATCH_WEIGHTS, coreCompetencies: 99 },
        }),
      ).rejects.toMatchObject({ status: 422 });
      expect((await readSettings(actorA)).defaultMatchingWeights).toEqual(weights);
    });

    it('stores guard modes, reasons, language and transport', async () => {
      const guardModes = {
        jdApproval: 'warn' as const,
        resumeApproval: 'block' as const,
        consent: 'block' as const,
        recruiterAssessment: 'warn' as const,
      };
      const s = await updateSettings(actorA, {
        guardModes,
        rejectionReasons: ['Too junior', 'Too senior'],
        locale: 'ko',
        emailTransport: 'log-only',
      });
      expect(s).toMatchObject({
        guardModes,
        rejectionReasons: ['Too junior', 'Too senior'],
        locale: 'ko',
        emailTransport: 'log-only',
      });
      const raw = (await admin.query(`SELECT settings FROM "Agency" WHERE id = $1`, [agencyA]))
        .rows[0].settings;
      expect(raw.locale).toBe('ko'); // the agency default UI language reads from here (ADR-015)
    });

    it('keeps each agency settings separate', async () => {
      expect((await readSettings(actorB)).recentlyContactedDays).toBe(30);
      expect((await readSettings(actorB)).visibility).toBe('all_positions');
    });
  });

  describe('usage (T-13-05)', () => {
    const call = (agencyId: string, purpose: string, cost: number, at: string) =>
      appScope(handle).withAgency(agencyId, (tx) =>
        tx.llmCall.create({
          data: {
            agencyId,
            purpose,
            model: 'claude-opus-5-5',
            promptVersion: 'v1',
            inputTokens: 100,
            outputTokens: 50,
            costUsd: cost,
            latencyMs: 1,
            createdAt: new Date(at),
          },
        }),
      );

    it('computes month boundaries in UTC', () => {
      expect(monthRange('2026-10')).toEqual({
        from: new Date('2026-10-01T00:00:00Z'),
        to: new Date('2026-11-01T00:00:00Z'),
      });
      expect(monthRange('2026-12').to).toEqual(new Date('2027-01-01T00:00:00Z'));
    });

    it('reports cost by purpose and the budget level for the month', async () => {
      await admin.query(`UPDATE "Agency" SET "aiMonthlyBudgetUsd" = 10 WHERE id = $1`, [agencyA]);
      await call(agencyA, 'jd.structure', 6, '2026-09-05T10:00:00Z');
      await call(agencyA, 'jd.structure', 2.5, '2026-09-20T10:00:00Z');
      await call(agencyA, 'profile.structure', 0.5, '2026-09-21T10:00:00Z');
      await call(agencyA, 'jd.structure', 100, '2026-08-31T23:59:59Z'); // another month
      await call(agencyB, 'jd.structure', 50, '2026-09-10T10:00:00Z'); // another agency

      const usage = await getAgencyUsage(agencyA, '2026-09', new Date('2026-09-25T00:00:00Z'));
      expect(usage.month).toBe('2026-09');
      expect(usage.byPurpose.map((r) => [r.key, r.costUsd, r.calls])).toEqual([
        ['jd.structure', 8.5, 2],
        ['profile.structure', 0.5, 1],
      ]);
      expect(usage.totals).toMatchObject({ calls: 3, costUsd: 9 });
      expect(usage.budget).toMatchObject({ limitUsd: 10, spentUsd: 9, level: 'warning' });
    });

    it('is empty and within budget for a month with no use', async () => {
      const usage = await getAgencyUsage(agencyB, '2026-01', new Date('2026-09-25T00:00:00Z'));
      expect(usage.byPurpose).toEqual([]);
      expect(usage.totals).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    });
  });
});
