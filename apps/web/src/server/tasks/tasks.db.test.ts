// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import { completeTask, createTask, listTasks, snoozeTask } from './service';

const NOW = new Date('2026-10-07T12:00:00Z');
const at = (iso: string) => new Date(iso);

describe.skipIf(!dbAvailable())('task engine (T-0-01)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let me: AgencyActor;
  let colleague: AgencyActor;
  let outsider: AgencyActor;
  let positionId: string;
  let candidateId: string;
  let entryId: string;
  const scope = () => appScope(handle);
  const run = <T>(
    fn: Parameters<ReturnType<typeof scope>['withAgency']>[1] & ((tx: never) => Promise<T>),
  ) => scope().withAgency(agencyA, fn as never) as Promise<T>;
  const make = (over: Partial<Parameters<typeof createTask>[1]> = {}) =>
    run((tx) =>
      createTask(tx, {
        agencyId: agencyA,
        ownerId: me.userId,
        kind: 'outreach_due',
        entityType: 'position',
        entityId: positionId,
        dueAt: at('2026-10-07T09:00:00Z'),
        ...over,
      }),
    );
  const list = (scopeName: 'today' | 'upcoming' | 'all', actor = me) =>
    run((tx) => listTasks(tx, actor, scopeName, NOW));
  const titles = async (scopeName: 'today' | 'upcoming' | 'all') =>
    (await list(scopeName)).map((t) => t.entityLabel);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Tasks A');
    agencyB = await createAgency(admin, 'Tasks B');
    me = { kind: 'agency', userId: randomUUID(), agencyId: agencyA, role: 'recruiter' };
    colleague = { kind: 'agency', userId: randomUUID(), agencyId: agencyA, role: 'admin' };
    outsider = { kind: 'agency', userId: randomUUID(), agencyId: agencyB, role: 'recruiter' };
    const seeded = await run(async (tx) => {
      const client = await tx.client.create({ data: { agencyId: agencyA, name: 'C' } });
      const position = await tx.position.create({
        data: {
          agencyId: agencyA,
          clientId: client.id,
          ownerId: me.userId,
          title: 'Staff Engineer',
          location: 'X',
          matchingWeights: {},
        },
      });
      const candidate = await tx.candidate.create({
        data: {
          agencyId: agencyA,
          fullName: 'Jane Doe',
          source: 'referral',
          createdById: me.userId,
        },
      });
      const entry = await tx.pipelineEntry.create({
        data: {
          agencyId: agencyA,
          positionId: position.id,
          candidateId: candidate.id,
          ownerId: me.userId,
        },
      });
      return { position: position.id, candidate: candidate.id, entry: entry.id };
    });
    positionId = seeded.position;
    candidateId = seeded.candidate;
    entryId = seeded.entry;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('creates a task once per owner, kind and entity while it is open', async () => {
    const first = await make({ kind: 'interview', entityType: 'candidate', entityId: candidateId });
    const again = await make({
      kind: 'interview',
      entityType: 'candidate',
      entityId: candidateId,
      dueAt: at('2026-10-20T00:00:00Z'),
    });
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, created: false });
    // A different owner or kind is a different task; after completion a new one may be created.
    expect(
      (
        await make({
          kind: 'interview',
          entityType: 'candidate',
          entityId: candidateId,
          ownerId: colleague.userId,
        })
      ).created,
    ).toBe(true);
    await run((tx) => completeTask(tx, me, first.id, NOW));
    expect(
      (await make({ kind: 'interview', entityType: 'candidate', entityId: candidateId })).created,
    ).toBe(true);
  });

  describe('my tasks today', () => {
    it('lists what is due by the end of today, overdue first, with names for what they are about', async () => {
      await make({
        entityType: 'pipeline_entry',
        entityId: entryId,
        dueAt: at('2026-10-07T16:00:00Z'),
        kind: 'proposal',
      }); // later today
      await make({
        entityType: 'position',
        entityId: positionId,
        dueAt: at('2026-10-05T09:00:00Z'),
        kind: 'approval_received',
      }); // overdue
      await make({
        entityType: 'position',
        entityId: positionId,
        dueAt: at('2026-10-09T09:00:00Z'),
        kind: 'offer_milestone',
      }); // upcoming
      const today = await list('today');
      const mine = today.filter((t) => ['proposal', 'approval_received'].includes(t.kind));
      expect(mine.map((t) => [t.kind, t.overdue, t.entityLabel])).toEqual([
        ['approval_received', true, 'Staff Engineer'],
        ['proposal', false, 'Jane Doe: Staff Engineer'],
      ]);
      expect(today.some((t) => t.kind === 'offer_milestone')).toBe(false);
      const upcoming = await list('upcoming');
      expect(upcoming.map((t) => t.kind)).toContain('offer_milestone');
      expect(upcoming.some((t) => t.kind === 'proposal')).toBe(false);
    });

    it("never shows other people's tasks, even to an admin", async () => {
      const mine = await list('all');
      expect(mine.every((t) => t.id !== undefined)).toBe(true);
      const theirs = await list('all', colleague);
      const myIds = new Set(mine.map((t) => t.id));
      expect(theirs.every((t) => !myIds.has(t.id))).toBe(true);
    });

    it('keeps agencies apart: another agency sees none of it', async () => {
      const seen = await scope().withAgency(agencyB, (tx) => listTasks(tx, outsider, 'all', NOW));
      expect(seen).toEqual([]);
    });
  });

  describe('completing', () => {
    it('completes your own task, logs it, and is harmless when repeated', async () => {
      const entityId = randomUUID();
      const { id } = await make({
        kind: 'outreach_due',
        entityType: 'candidate',
        entityId,
        dueAt: at('2026-10-07T08:00:00Z'),
      });
      await run((tx) => completeTask(tx, me, id, NOW));
      await run((tx) => completeTask(tx, me, id, NOW));
      expect((await list('all')).some((t) => t.id === id)).toBe(false);
      const log = await admin.query(
        `SELECT count(*)::int AS n FROM "ActivityLog" WHERE "agencyId" = $1 AND action = 'task.completed' AND "actorId" = $2 AND "entityId" = $3`,
        [agencyA, me.userId, entityId],
      );
      expect(log.rows[0].n).toBe(1);
    });

    it("does not let anyone complete or snooze someone else's task (404)", async () => {
      const { id } = await make({
        kind: 'proposal',
        entityType: 'candidate',
        entityId: randomUUID(),
        dueAt: at('2026-10-08T08:00:00Z'),
      });
      await expect(run((tx) => completeTask(tx, colleague, id, NOW))).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        run((tx) => snoozeTask(tx, colleague, id, at('2026-10-09T00:00:00Z'), NOW)),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        scope().withAgency(agencyB, (tx) => completeTask(tx, outsider, id, NOW)),
      ).rejects.toMatchObject({ status: 404 });
      expect((await list('all')).some((t) => t.id === id)).toBe(true);
    });
  });

  describe('snoozing', () => {
    it('hides a task from today until the snooze ends, but keeps it in "all"', async () => {
      const { id } = await make({
        kind: 'interview',
        entityType: 'position',
        entityId: positionId,
        dueAt: at('2026-10-07T07:00:00Z'),
      });
      expect((await list('today')).some((t) => t.id === id)).toBe(true);
      await run((tx) => snoozeTask(tx, me, id, at('2026-10-08T09:00:00Z'), NOW));
      expect((await list('today')).some((t) => t.id === id)).toBe(false);
      const all = await list('all');
      expect(all.find((t) => t.id === id)).toMatchObject({
        snoozedUntil: at('2026-10-08T09:00:00Z'),
      });
      // Once the snooze has passed it returns to the list.
      const later = await run((tx) => listTasks(tx, me, 'today', at('2026-10-08T10:00:00Z')));
      expect(later.some((t) => t.id === id)).toBe(true);
    });

    it('rejects a snooze in the past or more than 30 days ahead, and a snooze of a finished task', async () => {
      const { id } = await make({
        kind: 'offer_milestone',
        entityType: 'position',
        entityId: randomUUID(),
        dueAt: at('2026-10-07T07:00:00Z'),
      });
      await expect(
        run((tx) => snoozeTask(tx, me, id, at('2026-10-06T00:00:00Z'), NOW)),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        run((tx) => snoozeTask(tx, me, id, at('2026-12-01T00:00:00Z'), NOW)),
      ).rejects.toMatchObject({ status: 422 });
      await run((tx) => completeTask(tx, me, id, NOW));
      await expect(
        run((tx) => snoozeTask(tx, me, id, at('2026-10-09T00:00:00Z'), NOW)),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  it('lists nothing extra for an unused label type (entity labels are optional)', async () => {
    await make({
      kind: 'proposal',
      entityType: 'interview',
      entityId: randomUUID(),
      dueAt: at('2026-10-07T07:30:00Z'),
    });
    const task = (await list('today')).find((t) => t.entityType === 'interview');
    expect(task?.entityLabel).toBeNull();
    expect(await titles('all')).toBeTruthy();
  });
});
