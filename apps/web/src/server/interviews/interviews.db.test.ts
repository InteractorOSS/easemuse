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
import { createInterview, listInterviews, recordFeedback, updateInterview } from './service';

describe.skipIf(!dbAvailable())('interviews (T-9-01)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let other: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const entryAt = async (state: string) => {
    const { entry } = await readyMatchEntry(run, rec, clientId);
    await run((tx) =>
      tx.pipelineEntry.update({ where: { id: entry.id }, data: { state: state as 'submitted' } }),
    );
    return entry;
  };
  const openTasks = (interviewId: string) =>
    run((tx) =>
      tx.task.findMany({
        where: { kind: 'interview', entityId: interviewId, completedAt: null },
        select: { dueAt: true, ownerId: true },
      }),
    );

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Interview A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
        [agency, u],
      );
    }
    rec = { kind: 'agency', userId: u1, agencyId: agency, role: 'recruiter' };
    other = { kind: 'agency', userId: u2, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Iv Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('adds a round, moves a submitted candidate to interviewing and sets a reminder', async () => {
    const e = await entryAt('submitted');
    const when = new Date('2026-10-20T14:00:00Z');
    const iv = await run((tx) =>
      createInterview(tx, rec, e.id, {
        roundName: 'HM interview',
        scheduledAt: when,
        format: 'video',
        interviewers: ['Ms. Park'],
      }),
    );
    expect(iv).toMatchObject({
      roundName: 'HM interview',
      status: 'scheduled',
      interviewers: ['Ms. Park'],
    });
    expect(
      (await admin.query(`SELECT state FROM "PipelineEntry" WHERE id = $1`, [e.id])).rows[0].state,
    ).toBe('interviewing');
    expect(await openTasks(iv.id)).toEqual([{ dueAt: when, ownerId: rec.userId }]);
  });

  it('refuses rounds before submission and from someone else', async () => {
    const early = await entryAt('qualified');
    await expect(
      run((tx) => createInterview(tx, rec, early.id, { roundName: 'x', interviewers: [] })),
    ).rejects.toMatchObject({ status: 409 });
    const e = await entryAt('interviewing');
    await expect(
      run((tx) => createInterview(tx, other, e.id, { roundName: 'x', interviewers: [] })),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('moves the reminder when rescheduled and closes it when the round is done', async () => {
    const e = await entryAt('interviewing');
    const iv = await run((tx) =>
      createInterview(tx, rec, e.id, {
        roundName: 'Round 2',
        scheduledAt: new Date('2026-10-22T09:00:00Z'),
        interviewers: [],
      }),
    );
    const later = new Date('2026-10-23T09:00:00Z');
    await run((tx) => updateInterview(tx, rec, e.id, iv.id, { scheduledAt: later }));
    expect(await openTasks(iv.id)).toEqual([{ dueAt: later, ownerId: rec.userId }]);
    await run((tx) => updateInterview(tx, rec, e.id, iv.id, { status: 'completed' }));
    expect(await openTasks(iv.id)).toEqual([]);
  });

  it('records the hiring manager and candidate feedback apart, with ratings and comments', async () => {
    const e = await entryAt('interviewing');
    const iv = await run((tx) =>
      createInterview(tx, rec, e.id, { roundName: 'Final', interviewers: [] }),
    );
    await run((tx) =>
      recordFeedback(tx, rec, e.id, iv.id, {
        fromRole: 'hm',
        ratings: { technicalFit: 'strong', industryExperience: 'gap' },
        comments: 'Needs retail depth',
      }),
    );
    await run((tx) =>
      recordFeedback(tx, rec, e.id, iv.id, {
        fromRole: 'candidate',
        ratings: {},
        comments: 'Liked the team',
      }),
    );
    const [round] = await run((tx) => listInterviews(tx, rec, e.id));
    expect(round!.feedback.map((f) => [f.fromRole, f.ratings, f.comments])).toEqual([
      ['hm', { technicalFit: 'strong', industryExperience: 'gap' }, 'Needs retail depth'],
      ['candidate', {}, 'Liked the team'],
    ]);
  });
});
