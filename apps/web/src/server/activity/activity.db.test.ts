// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbHandle } from '@/lib/db/client';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { logActivity, listTimeline, timelineQuerySchema } from './service';

describe.skipIf(!dbAvailable())('activity log and timeline (T-0-02)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let person: string;
  const entityId = randomUUID();
  const users: string[] = [];
  const scope = () => appScope(handle);
  const query = (over: Record<string, unknown> = {}) =>
    timelineQuerySchema.parse({ entityType: 'position', entityId, limit: '50', ...over });

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Timeline A');
    agencyB = await createAgency(admin, 'Timeline B');
    person = await createUser(admin);
    await admin.query(`UPDATE "User" SET name = 'Rita Recruiter' WHERE id = $1`, [person]);
    users.push(person);
    for (const [i, action] of [
      'position.created',
      'artifact.approved',
      'pipeline.transition',
    ].entries()) {
      await scope().withAgency(agencyA, (tx) =>
        logActivity(tx, {
          agencyId: agencyA,
          actor: { type: 'user', id: person },
          action,
          entityType: 'position',
          entityId,
          data: { n: i },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await scope().withAgency(agencyA, (tx) =>
      logActivity(tx, {
        agencyId: agencyA,
        actor: { type: 'system' },
        action: 'job.finished',
        entityType: 'position',
        entityId,
      }),
    );
    await scope().withAgency(agencyA, (tx) =>
      logActivity(tx, {
        agencyId: agencyA,
        actor: { type: 'user', id: person },
        action: 'other.entity',
        entityType: 'candidate',
        entityId: randomUUID(),
      }),
    );
    await scope().withAgency(agencyB, (tx) =>
      logActivity(tx, {
        agencyId: agencyB,
        actor: { type: 'user', id: person },
        action: 'leak.check',
        entityType: 'position',
        entityId,
      }),
    );
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB], users });
    await admin.end();
    await handle.close();
  });

  it("shows one entity's events newest first with who did them, and nothing else", async () => {
    const { items, nextCursor } = await scope().withAgency(agencyA, (tx) =>
      listTimeline(tx, query()),
    );
    expect(items.map((e) => e.action)).toEqual([
      'job.finished',
      'pipeline.transition',
      'artifact.approved',
      'position.created',
    ]);
    expect(items[0]).toMatchObject({ actorType: 'system', actorName: null });
    expect(items[1]).toMatchObject({
      actorType: 'user',
      actorName: 'Rita Recruiter',
      data: { n: 2 },
    });
    expect(nextCursor).toBeNull();
  });

  it('pages with an opaque cursor without skipping or repeating events', async () => {
    const first = await scope().withAgency(agencyA, (tx) =>
      listTimeline(tx, query({ limit: '3' })),
    );
    expect(first.items).toHaveLength(3);
    const second = await scope().withAgency(agencyA, (tx) =>
      listTimeline(tx, query({ limit: '3', cursor: first.nextCursor! })),
    );
    expect(second.items.map((e) => e.action)).toEqual(['position.created']);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((e) => e.id)).size).toBe(4);
  });

  it("does not show another agency's events for the same entity id", async () => {
    const mine = await scope().withAgency(agencyA, (tx) => listTimeline(tx, query()));
    expect(mine.items.some((e) => e.action === 'leak.check')).toBe(false);
    const theirs = await scope().withAgency(agencyB, (tx) => listTimeline(tx, query()));
    expect(theirs.items.map((e) => e.action)).toEqual(['leak.check']);
  });

  it('rejects a bad cursor and a bad entity id', async () => {
    await expect(
      scope().withAgency(agencyA, (tx) => listTimeline(tx, query({ cursor: 'bogus' }))),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      timelineQuerySchema.safeParse({ entityType: 'position', entityId: 'nope' }).success,
    ).toBe(false);
  });

  it('records only what it is given: ids and counts, no content', async () => {
    const row = (
      await admin.query(
        `SELECT data FROM "ActivityLog" WHERE action = 'artifact.approved' AND "entityId" = $1`,
        [entityId],
      )
    ).rows[0];
    expect(row.data).toEqual({ n: 1 });
  });
});
