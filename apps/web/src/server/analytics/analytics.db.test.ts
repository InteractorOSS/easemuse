// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import { addCandidateToPosition } from '@/server/pipeline/service';
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
import { analyticsCsv, getAnalytics, resolvePeriod, type AnalyticsView } from './service';

describe.skipIf(!dbAvailable())('analytics service (US-1101)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let manager: AgencyActor;
  let recruiter1: AgencyActor;
  let recruiter2: AgencyActor;
  let otherAgency: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(agencyId: string, fn: (tx: Tx) => Promise<T>) =>
    appScope(handle).withAgency(agencyId, fn);
  const view = (actor: AgencyActor, query = {}) =>
    run(actor.agencyId, (tx) => getAnalytics(tx, actor, query));

  async function member(agencyId: string, role: 'admin' | 'recruiter'): Promise<AgencyActor> {
    const userId = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
      [agencyId, userId, role],
    );
    return { kind: 'agency', userId, agencyId, role };
  }

  /** A position owned by the actor with one candidate; optionally submitted and interviewed today. */
  async function positionWithCandidate(actor: AgencyActor, clientId: string, submitted: boolean) {
    const position = await run(actor.agencyId, (tx) =>
      createPosition(tx, actor, { clientId, title: 'HR Business Partner', location: 'Chicago' }),
    );
    // Being worked: positions count toward capacity only from sourcing on.
    await admin.query(
      `INSERT INTO "PositionTransition" (id, "agencyId", "positionId", "fromStatus", "toStatus", "actorId")
       VALUES (gen_random_uuid(), $1, $2, 'draft', 'sourcing', $3)`,
      [actor.agencyId, position.id, actor.userId],
    );
    const candidate = await run(actor.agencyId, (tx) =>
      tx.candidate.create({
        data: {
          agencyId: actor.agencyId,
          fullName: 'Jordan Rivera',
          source: 'linkedin',
          createdById: actor.userId,
          status: 'active',
        },
        select: { id: true },
      }),
    );
    const entry = await run(actor.agencyId, (tx) =>
      addCandidateToPosition(tx, actor, position.id, { candidateId: candidate.id }),
    );
    if (submitted) {
      for (const toState of ['submitted', 'interviewing'] as const) {
        await admin.query(
          `INSERT INTO "PipelineTransition" (id, "agencyId", "entryId", "toState", "actorId")
           VALUES (gen_random_uuid(), $1, $2, $3::"PipelineState", $4)`,
          [actor.agencyId, entry.id, toState, actor.userId],
        );
      }
    }
    return { positionId: position.id, entryId: entry.id };
  }

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Analytics A');
    agencyB = await createAgency(admin, 'Analytics B');
    manager = await member(agencyA, 'admin');
    recruiter1 = await member(agencyA, 'recruiter');
    recruiter2 = await member(agencyA, 'recruiter');
    otherAgency = await member(agencyB, 'admin');
    const clientA = (await run(agencyA, (tx) => createClient(tx, manager, { name: 'Northwind' })))
      .client.id;
    const clientB = (
      await run(agencyB, (tx) => createClient(tx, otherAgency, { name: 'Elsewhere' }))
    ).client.id;
    await positionWithCandidate(recruiter1, clientA, true);
    await positionWithCandidate(recruiter2, clientA, false);
    await positionWithCandidate(otherAgency, clientB, true);
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it("counts every visible position of the agency, and nothing of another agency's", async () => {
    const v = await view(manager);
    expect(v.sources).toEqual([
      expect.objectContaining({ source: 'linkedin', added: 2, submitted: 1 }),
    ]);
    expect(v.kpis.submissionToInterview).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect((await view(otherAgency)).sources[0]).toMatchObject({ added: 1 });
  });

  it('filters by recruiter, client and position', async () => {
    expect((await view(manager, { ownerId: recruiter2.userId })).sources[0]).toMatchObject({
      added: 1,
      submitted: 0,
    });
    const other = '00000000-0000-4000-8000-000000000000';
    expect((await view(manager, { clientId: other })).sources).toEqual([]);
    expect((await view(manager, { positionId: other })).sources).toEqual([]);
  });

  it('applies the agency visibility rule: with "own and shared" a recruiter sees only their own positions', async () => {
    expect((await view(recruiter2)).sources[0]).toMatchObject({ added: 2 });
    await admin.query(
      `UPDATE "Agency" SET settings = settings || '{"visibility":"own_and_shared"}'::jsonb WHERE id = $1`,
      [agencyA],
    );
    try {
      const own = await view(recruiter2);
      expect(own.sources[0]).toMatchObject({ added: 1, submitted: 0 });
      expect(own.kpis.submissionToInterview.denominator).toBe(0);
      // Managers still see everything.
      expect((await view(manager)).sources[0]).toMatchObject({ added: 2 });
    } finally {
      await admin.query(`UPDATE "Agency" SET settings = settings - 'visibility' WHERE id = $1`, [
        agencyA,
      ]);
    }
  });

  it('names each recruiter in the capacity table', async () => {
    const v = await view(manager);
    expect(v.capacity.recruiters.map((r) => r.userId).sort()).toEqual(
      [recruiter1.userId, recruiter2.userId].sort(),
    );
    expect(v.capacity.recruiters.every((r) => r.name.length > 0)).toBe(true);
  });
});

describe('analytics period and CSV', () => {
  const now = new Date('2026-10-07T15:00:00Z');

  it('defaults to the last 90 days including today, and takes inclusive days', () => {
    expect(resolvePeriod({}, now)).toEqual({
      from: new Date('2026-07-10T00:00:00Z'),
      to: new Date('2026-10-08T00:00:00Z'),
    });
    expect(resolvePeriod({ from: '2026-07-01', to: '2026-09-30' }, now)).toEqual({
      from: new Date('2026-07-01T00:00:00Z'),
      to: new Date('2026-10-01T00:00:00Z'),
    });
  });

  it('refuses a period that ends before it starts or is longer than two years (422)', () => {
    expect(() => resolvePeriod({ from: '2026-09-01', to: '2026-08-01' }, now)).toThrow(
      expect.objectContaining({ status: 422 }),
    );
    expect(() => resolvePeriod({ from: '2023-01-01', to: '2026-08-01' }, now)).toThrow(
      expect.objectContaining({ status: 422 }),
    );
  });

  it('writes each table as CSV, quoting commas and neutralising spreadsheet formulas', () => {
    const r = { numerator: 1, denominator: 2, value: 0.5 };
    const empty = { medianDays: null, count: 0 };
    const v: AnalyticsView = {
      range: { from: '2026-07-01', to: '2026-09-30' },
      filters: { clientId: null, positionId: null, ownerId: null },
      kpis: {
        timeToFill: { medianDays: 41, count: 1 },
        timeToInterview: empty,
        outreachResponse: r,
        submissionToInterview: r,
        interviewToOffer: r,
        offerAcceptance: r,
        interviewToHire: r,
        sourceToHire: r,
        conversion: [{ from: 'sourced', to: 'contacted', rate: r }],
      },
      sources: [],
      capacity: {
        weeks: 13,
        activePositionsPerRecruiter: 1.5,
        timePerPosition: empty,
        recruiters: [
          {
            userId: 'u1',
            name: 'Kim, "Alex"',
            activePositionsPerWeek: 2,
            filled: 1,
            timePerPosition: empty,
          },
          {
            userId: 'u2',
            name: '=HYPERLINK("x")',
            activePositionsPerWeek: 1,
            filled: 0,
            timePerPosition: empty,
          },
        ],
      },
    };
    const kpis = analyticsCsv(v, 'kpis').split('\r\n');
    expect(kpis[0]).toBe('kpi,value,numerator,denominator,median_days,count');
    expect(kpis).toContain('timeToFill,,,,41,1');
    expect(kpis).toContain('offerAcceptance,0.5,1,2,,');
    const capacity = analyticsCsv(v, 'capacity');
    expect(capacity).toContain('"Kim, ""Alex""",2,1,');
    expect(capacity).toContain(`"'=HYPERLINK(""x"")",1,0,`);
    expect(analyticsCsv(v, 'conversion')).toContain('sourced,contacted,0.5,1,2');
  });
});
