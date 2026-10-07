// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_REJECTION_REASONS, type AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import { completeTask } from '@/server/tasks/service';
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
import { getOffer, recordOutcome, saveOffer } from './service';

const NOW = new Date('2026-10-10T09:00:00Z');

describe.skipIf(!dbAvailable())('offer tracking (T-10-01)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec: AgencyActor;
  let clientId: string;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  const entryAt = async (state: string, positionId?: string) => {
    const { entry, positionId: pid } = await readyMatchEntry(
      run,
      rec,
      clientId,
      positionId ? { positionId } : {},
    );
    await run((tx) =>
      tx.pipelineEntry.update({ where: { id: entry.id }, data: { state: state as 'offer' } }),
    );
    return { entry, positionId: pid };
  };
  const reminders = async (entryId: string) =>
    (
      await run((tx) =>
        tx.task.findMany({
          where: { kind: 'offer_milestone', entityId: entryId, completedAt: null },
          select: { dueAt: true },
        }),
      )
    ).map((r) => r.dueAt.toISOString().slice(0, 10));
  const positionStatus = async (id: string) =>
    (await admin.query(`SELECT status FROM "Position" WHERE id = $1`, [id])).rows[0].status;

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Offer A');
    const u = await createUser(admin);
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
      [agency, u],
    );
    rec = { kind: 'agency', userId: u, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec, { name: 'Offer Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('is empty until saved, then keeps the milestones and merges later changes', async () => {
    const { entry } = await entryAt('offer');
    expect((await run((tx) => getOffer(tx, rec, entry.id))).exists).toBe(false);
    await run((tx) =>
      saveOffer(
        tx,
        rec,
        entry.id,
        {
          milestones: { offerPreparation: { status: 'done', date: '2026-10-08' } },
          counterofferRisk: 'medium',
        },
        NOW,
      ),
    );
    const view = await run((tx) =>
      saveOffer(
        tx,
        rec,
        entry.id,
        {
          milestones: { compensationDiscussion: { status: 'in_progress', notes: '180k vs 190k' } },
        },
        NOW,
      ),
    );
    expect(view.milestones.offerPreparation).toMatchObject({ status: 'done', date: '2026-10-08' });
    expect(view.milestones.compensationDiscussion).toMatchObject({
      status: 'in_progress',
      notes: '180k vs 190k',
    });
    expect(view.counterofferRisk).toBe('medium');
  });

  it('only works once the candidate is at the offer stage', async () => {
    const { entry } = await entryAt('interviewing');
    await expect(
      run((tx) => saveOffer(tx, rec, entry.id, { counterofferRisk: 'low' }, NOW)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('records outcomes in order with their reasons, and fills the position when openings are met', async () => {
    const { entry, positionId } = await entryAt('offer');
    await expect(
      run((tx) => recordOutcome(tx, rec, entry.id, { outcome: 'started', at: '2026-10-09' }, NOW)),
    ).rejects.toMatchObject({ status: 409 });
    await run((tx) =>
      recordOutcome(tx, rec, entry.id, { outcome: 'accepted', at: '2026-10-09' }, NOW),
    );
    expect(await positionStatus(positionId)).toBe('filled');
    const view = await run((tx) =>
      recordOutcome(tx, rec, entry.id, { outcome: 'started', at: '2026-10-10' }, NOW),
    );
    expect(view).toMatchObject({ outcome: 'started', startDate: '2026-10-10', state: 'started' });
    expect(view.milestones.offerAcceptance).toMatchObject({ status: 'done', date: '2026-10-09' });
    expect(await positionStatus(positionId)).toBe('filled');
  });

  it('declined needs a reason from the agency list; reneged reopens a filled position', async () => {
    const { entry, positionId } = await entryAt('offer');
    await expect(
      run((tx) =>
        recordOutcome(
          tx,
          rec,
          entry.id,
          { outcome: 'declined', at: '2026-10-09', reasonCode: 'not-on-the-list' },
          NOW,
        ),
      ),
    ).rejects.toMatchObject({ status: 422 });
    await run((tx) =>
      recordOutcome(tx, rec, entry.id, { outcome: 'accepted', at: '2026-10-09' }, NOW),
    );
    expect(await positionStatus(positionId)).toBe('filled');
    await run((tx) =>
      recordOutcome(
        tx,
        rec,
        entry.id,
        { outcome: 'reneged', at: '2026-10-10', reason: 'Took the counteroffer' },
        NOW,
      ),
    );
    expect(await positionStatus(positionId)).toBe('interviewing');
    const second = await entryAt('offer', positionId);
    await run((tx) =>
      recordOutcome(
        tx,
        rec,
        second.entry.id,
        { outcome: 'declined', at: '2026-10-10', reasonCode: DEFAULT_REJECTION_REASONS[0] },
        NOW,
      ),
    );
    expect(await positionStatus(positionId)).toBe('interviewing');
  });

  it('keeps one reminder open and schedules the next when it is completed', async () => {
    const { entry } = await entryAt('offer');
    await run((tx) =>
      saveOffer(tx, rec, entry.id, { resignationDate: '2026-10-20', startDate: '2026-11-15' }, NOW),
    );
    expect(await reminders(entry.id)).toEqual(['2026-10-21']);
    const task = await admin.query(
      `SELECT id FROM "Task" WHERE kind = 'offer_milestone' AND "entityId" = $1 AND "completedAt" IS NULL`,
      [entry.id],
    );
    await run((tx) => completeTask(tx, rec, task.rows[0].id, new Date('2026-10-21T10:00:00Z')));
    expect(await reminders(entry.id)).toEqual(['2026-11-08']);
    // An outcome of declined ends the reminders.
    await run((tx) =>
      recordOutcome(
        tx,
        rec,
        entry.id,
        { outcome: 'declined', at: '2026-10-22', reasonCode: DEFAULT_REJECTION_REASONS[0] },
        new Date('2026-10-22T09:00:00Z'),
      ),
    );
    expect(await reminders(entry.id)).toEqual([]);
  });
});
