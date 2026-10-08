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
import { readyMatchEntry } from '@/test/match-fixtures';
import { analyticsCsv, getAnalytics } from './service';

describe.skipIf(!dbAvailable())('analytics reads (T-11-01 to T-11-05)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let lead: AgencyActor;
  let rec1: AgencyActor;
  let rec2: AgencyActor;
  let outsider: AgencyActor;
  let clientId: string;
  let entryId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const runA = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  const runB = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyB, fn);
  const member = async (agency: string, role: 'lead' | 'recruiter'): Promise<AgencyActor> => {
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
      [agency, u, role],
    );
    return { kind: 'agency', userId: u, agencyId: agency, role };
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Analytics A');
    agencyB = await createAgency(admin, 'Analytics B');
    lead = await member(agencyA, 'lead');
    rec1 = await member(agencyA, 'recruiter');
    rec2 = await member(agencyA, 'recruiter');
    outsider = await member(agencyB, 'lead');
    clientId = (await runA((tx) => createClient(tx, rec1, { name: 'Analytics Client' }))).client.id;
    const made = await readyMatchEntry(runA, rec1, clientId);
    entryId = made.entry.id;
    // A short history: contacted by email, replied, submitted, one interview.
    await runA(async (tx) => {
      await tx.pipelineEntry.update({ where: { id: entryId }, data: { state: 'interviewing' } });
      for (const toState of ['contacting', 'interested', 'submitted', 'interviewing'] as const) {
        await tx.pipelineTransition.create({
          data: { agencyId: agencyA, entryId, toState, actorId: rec1.userId },
        });
      }
      await tx.outreachTouch.create({
        data: {
          agencyId: agencyA,
          entryId,
          touchNumber: 1,
          channel: 'email',
          status: 'sent',
          sentAt: new Date(),
          response: 'interested',
        },
      });
      await tx.interview.create({
        data: { agencyId: agencyA, entryId, roundName: 'Round 1', scheduledAt: new Date() },
      });
    });
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('reads the entry history the formulas need', async () => {
    const result = await runA((tx) => getAnalytics(tx, lead, {}));
    expect(result.entryCount).toBe(1);
    expect(result.kpis.outreachResponseRate).toMatchObject({ numerator: 1, denominator: 1 });
    expect(result.kpis.submissionToInterview).toMatchObject({ numerator: 1, denominator: 1 });
    expect(result.stages.find((s) => s.stage === 'interviewing')!.reached).toBe(1);
    expect(result.sources.reduce((a, s) => a + s.added, 0)).toBe(1);
    expect(result.capacity[0]!.recruiterId).toBeNull();
  });

  it('shows a recruiter only their own entries, and a lead can narrow by recruiter', async () => {
    expect((await runA((tx) => getAnalytics(tx, rec1, {}))).entryCount).toBe(1);
    // rec2 asks for rec1's figures and still gets only their own (none).
    const other = await runA((tx) => getAnalytics(tx, rec2, { recruiterId: rec1.userId }));
    expect(other.entryCount).toBe(0);
    expect(other.recruiters).toEqual([]);
    expect(
      (await runA((tx) => getAnalytics(tx, lead, { recruiterId: rec2.userId }))).entryCount,
    ).toBe(0);
    const all = await runA((tx) => getAnalytics(tx, lead, { recruiterId: rec1.userId }));
    expect(all.entryCount).toBe(1);
    expect(all.recruiters.length).toBeGreaterThanOrEqual(3);
  });

  it('applies the client, position and date filters', async () => {
    const position = (
      await runA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId } }))
    ).positionId;
    expect((await runA((tx) => getAnalytics(tx, lead, { clientId }))).entryCount).toBe(1);
    expect(
      (
        await runA((tx) =>
          getAnalytics(tx, lead, { clientId: '11111111-1111-4111-8111-111111111111' }),
        )
      ).entryCount,
    ).toBe(0);
    expect((await runA((tx) => getAnalytics(tx, lead, { positionId: position }))).entryCount).toBe(
      1,
    );
    expect(
      (await runA((tx) => getAnalytics(tx, lead, { from: '2020-01-01', to: '2020-02-01' })))
        .entryCount,
    ).toBe(0);
  });

  it("never shows another agency's data, whatever ids the filters name", async () => {
    expect((await runB((tx) => getAnalytics(tx, outsider, {}))).entryCount).toBe(0);
    expect((await runB((tx) => getAnalytics(tx, outsider, { clientId }))).entryCount).toBe(0);
  });

  it('exports every table as CSV with the same filters', async () => {
    const result = await runA((tx) => getAnalytics(tx, lead, { clientId }));
    for (const table of ['kpis', 'stages', 'sources', 'capacity'] as const) {
      const csv = analyticsCsv(result, table);
      expect(csv.startsWith('﻿')).toBe(true);
      expect(csv.split('\r\n').length).toBeGreaterThan(2);
    }
    expect(analyticsCsv(result, 'kpis')).toContain('outreach_response_rate,100,percent,1,1');
  });
});
