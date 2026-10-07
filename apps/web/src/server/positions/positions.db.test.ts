// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCH_WEIGHTS,
  POSITION_TRANSITIONS,
  POSITION_STATUSES,
  positionPatchSchema,
  type AgencyActor,
} from '@easemuse/core';
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
import { createClient, addContact } from '@/server/clients/service';
import { approveJdForSourcing } from '@/test/jd-fixtures';
import {
  changeStatus,
  createPosition,
  getPosition,
  listPositions,
  updatePosition,
} from './service';

describe('position status map', () => {
  it('has a way out of every status except the two final ones', () => {
    for (const s of POSITION_STATUSES) {
      const final = s === 'filled' || s === 'cancelled';
      expect(POSITION_TRANSITIONS[s].length === 0).toBe(final);
    }
  });
});

describe.skipIf(!dbAvailable())('positions and status service (T-1-03, T-1-14)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let lead: AgencyActor;
  let rec1: AgencyActor;
  let rec2: AgencyActor;
  let outsider: AgencyActor;
  let clientId: string;
  let contactId: string;
  const scoped = () => appScope(handle);
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => scoped().withAgency(agencyA, fn);
  const base = (over: Record<string, unknown> = {}) => ({
    clientId,
    title: 'Staff Engineer',
    location: 'Seoul',
    ...over,
  });

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Pos A');
    agencyB = await createAgency(admin, 'Pos B');
    const [u1, u2, u3, u4] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    for (const [u, role] of [
      [u1, 'lead'],
      [u2, 'recruiter'],
      [u3, 'recruiter'],
    ] as const) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, $3::"AgencyRole", true, now())`,
        [agencyA, u, role],
      );
    }
    lead = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'lead' };
    rec1 = { kind: 'agency', userId: u2, agencyId: agencyA, role: 'recruiter' };
    rec2 = { kind: 'agency', userId: u3, agencyId: agencyA, role: 'recruiter' };
    outsider = { kind: 'agency', userId: u4, agencyId: agencyB, role: 'recruiter' };
    const made = await inA((tx) => createClient(tx, lead, { name: 'Pos Client' }));
    clientId = made.client.id;
    contactId = (await inA((tx) => addContact(tx, lead, clientId, { name: 'Hana Choi' }))).id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  describe('creating', () => {
    it('creates a Draft position owned by the creator, with the agency default weights and a first transition', async () => {
      const p = await inA((tx) =>
        createPosition(
          tx,
          rec1,
          base({
            compMin: 90000,
            compMax: 120000,
            requiredSkills: ['Go'],
            hiringManagerId: contactId,
          }),
        ),
      );
      expect(p).toMatchObject({
        status: 'draft',
        ownerId: rec1.userId,
        clientName: 'Pos Client',
        compMin: 90000,
        compMax: 120000,
        compCurrency: 'USD',
        openings: 1,
        requiredSkills: ['Go'],
      });
      expect(p.matchingWeights).toEqual(DEFAULT_MATCH_WEIGHTS);
      const t = await admin.query(
        `SELECT "fromStatus", "toStatus", "actorId" FROM "PositionTransition" WHERE "positionId" = $1`,
        [p.id],
      );
      expect(t.rows).toEqual([{ fromStatus: null, toStatus: 'draft', actorId: rec1.userId }]);
    });

    it('lets a lead assign another member as owner but not a recruiter, and not a non-member', async () => {
      expect(
        (await inA((tx) => createPosition(tx, lead, base({ ownerId: rec2.userId })))).ownerId,
      ).toBe(rec2.userId);
      await expect(
        inA((tx) => createPosition(tx, rec1, base({ ownerId: rec2.userId }))),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        inA((tx) => createPosition(tx, lead, base({ ownerId: randomUUID() }))),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('rejects an unknown or archived client and a hiring manager from another client', async () => {
      await expect(
        inA((tx) => createPosition(tx, rec1, base({ clientId: randomUUID() }))),
      ).rejects.toMatchObject({ status: 422 });
      const other = (await inA((tx) => createClient(tx, lead, { name: 'Other Client' }))).client;
      await expect(
        inA((tx) =>
          createPosition(tx, rec1, base({ clientId: other.id, hiringManagerId: contactId })),
        ),
      ).rejects.toMatchObject({ status: 422 });
      await inA((tx) =>
        tx.client.update({ where: { id: other.id }, data: { archivedAt: new Date() } }),
      );
      await expect(
        inA((tx) => createPosition(tx, rec1, base({ clientId: other.id }))),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('does not let another agency use this client', async () => {
      await expect(
        scoped().withAgency(agencyB, (tx) => createPosition(tx, outsider, base())),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('editing', () => {
    it('lets the owner and a lead edit, keeps unchanged fields, and checks the pay range against stored values', async () => {
      const p = await inA((tx) => createPosition(tx, rec1, base({ compMin: 100, compMax: 200 })));
      const edited = await inA((tx) =>
        updatePosition(tx, rec1, p.id, { title: 'Principal Engineer', department: 'Platform' }),
      );
      expect(edited).toMatchObject({
        title: 'Principal Engineer',
        department: 'Platform',
        compMin: 100,
        compMax: 200,
      });
      expect((await inA((tx) => updatePosition(tx, lead, p.id, { openings: 3 }))).openings).toBe(3);
      await expect(
        inA((tx) => updatePosition(tx, rec1, p.id, { compMin: 300 })),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('does not let another recruiter edit it (403), and an owner reassignment needs a lead', async () => {
      const p = await inA((tx) => createPosition(tx, rec1, base()));
      await expect(
        inA((tx) => updatePosition(tx, rec2, p.id, { title: 'Nope' })),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        inA((tx) => updatePosition(tx, rec1, p.id, { ownerId: rec2.userId })),
      ).rejects.toMatchObject({ status: 403 });
      expect(
        (await inA((tx) => updatePosition(tx, lead, p.id, { ownerId: rec2.userId }))).ownerId,
      ).toBe(rec2.userId);
    });

    it('logs old and new matching weights when they change', async () => {
      const p = await inA((tx) => createPosition(tx, rec1, base()));
      const next = { ...DEFAULT_MATCH_WEIGHTS, coreCompetencies: 30, careerLevel: 20 };
      await inA((tx) => updatePosition(tx, rec1, p.id, { matchingWeights: next }));
      const log = await admin.query(
        `SELECT data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'position.updated'`,
        [p.id],
      );
      expect(log.rows[0].data.weights).toEqual({ from: DEFAULT_MATCH_WEIGHTS, to: next });
      // The sum-to-100 rule is the request schema's job (422 at the route), not the service's.
      expect(
        positionPatchSchema.safeParse({ matchingWeights: { ...next, careerLevel: 25 } }).success,
      ).toBe(false);
    });

    it('keeps agencies apart', async () => {
      const p = await inA((tx) => createPosition(tx, rec1, base()));
      await expect(
        scoped().withAgency(agencyB, (tx) => getPosition(tx, outsider, p.id)),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        scoped().withAgency(agencyB, (tx) => updatePosition(tx, outsider, p.id, { title: 'X1' })),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('status service', () => {
    const start = async (owner: AgencyActor = rec1) =>
      (await inA((tx) => createPosition(tx, owner, base()))).id;
    const move = (
      id: string,
      status: Parameters<typeof changeStatus>[3]['status'],
      reason?: string,
      who: AgencyActor = rec1,
    ) => inA((tx) => changeStatus(tx, who, id, { status, ...(reason ? { reason } : {}) }));

    it('walks the happy path, writing one transition per move', async () => {
      const id = await start();
      await approveJdForSourcing(inA, rec1, id);
      for (const s of ['intake', 'sourcing', 'interviewing', 'offer', 'filled'] as const)
        await move(id, s);
      const rows = await admin.query(
        `SELECT "fromStatus", "toStatus" FROM "PositionTransition" WHERE "positionId" = $1 ORDER BY "createdAt", id`,
        [id],
      );
      expect(rows.rows.map((r) => `${r.fromStatus ?? '-'}>${r.toStatus}`)).toEqual([
        '->draft',
        'draft>intake',
        'intake>sourcing',
        'sourcing>interviewing',
        'interviewing>offer',
        'offer>filled',
      ]);
      expect((await inA((tx) => getPosition(tx, rec1, id))).status).toBe('filled');
    });

    it('refuses a move that is not allowed (409) and does not change anything', async () => {
      const id = await start();
      await expect(move(id, 'filled')).rejects.toMatchObject({ status: 409 });
      await expect(move(id, 'draft')).rejects.toMatchObject({ status: 409 });
      expect((await inA((tx) => getPosition(tx, rec1, id))).status).toBe('draft');
      await move(id, 'cancelled', 'Client withdrew');
      await expect(move(id, 'intake')).rejects.toMatchObject({ status: 409 }); // cancelled is final
    });

    it('requires a reason to hold or cancel and records it', async () => {
      const id = await start();
      await expect(move(id, 'on_hold')).rejects.toMatchObject({ status: 422 });
      await move(id, 'on_hold', 'Budget freeze');
      const t = await admin.query(
        `SELECT reason FROM "PositionTransition" WHERE "positionId" = $1 AND "toStatus" = 'on_hold'`,
        [id],
      );
      expect(t.rows[0].reason).toBe('Budget freeze');
    });

    it('resumes a held position only where it was, or cancels it', async () => {
      const id = await start();
      await move(id, 'intake');
      await approveJdForSourcing(inA, rec1, id);
      await move(id, 'sourcing');
      await move(id, 'on_hold', 'Waiting on client');
      await expect(move(id, 'offer')).rejects.toMatchObject({ status: 409 });
      await expect(move(id, 'draft')).rejects.toMatchObject({ status: 409 });
      expect((await move(id, 'sourcing')).status).toBe('sourcing');
      await move(id, 'on_hold', 'Again');
      expect((await move(id, 'cancelled', 'Closed')).status).toBe('cancelled');
    });

    it('only the owner, a lead or an admin may change the status; others get 403', async () => {
      const id = await start();
      await expect(move(id, 'intake', undefined, rec2)).rejects.toMatchObject({ status: 403 });
      expect((await move(id, 'intake', undefined, lead)).status).toBe('intake');
    });

    it('logs the change on the timeline', async () => {
      const id = await start();
      await move(id, 'intake');
      const log = await admin.query(
        `SELECT data FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'position.status_changed'`,
        [id],
      );
      expect(log.rows[0].data).toEqual({ from: 'draft', to: 'intake' });
    });
  });

  describe('listing and visibility', () => {
    it('filters, pages newest first, and applies the "own and shared" rule only to recruiters', async () => {
      const mine = await inA((tx) => createPosition(tx, rec1, base({ title: 'List Mine' })));
      const theirs = await inA((tx) => createPosition(tx, rec2, base({ title: 'List Theirs' })));
      const ids = async (actor: AgencyActor) =>
        (await inA((tx) => listPositions(tx, actor, { limit: 100, q: 'List ' }))).items.map(
          (p) => p.id,
        );
      // Default rule: everyone sees every position.
      expect(await ids(rec1)).toEqual(expect.arrayContaining([mine.id, theirs.id]));
      await admin.query(
        `UPDATE "Agency" SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{visibility}', '"own_and_shared"') WHERE id = $1`,
        [agencyA],
      );
      expect(await ids(rec1)).toEqual([mine.id]);
      expect(await ids(lead)).toEqual(expect.arrayContaining([mine.id, theirs.id]));
      await expect(inA((tx) => getPosition(tx, rec1, theirs.id))).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        inA((tx) => updatePosition(tx, rec1, theirs.id, { title: 'Hidden' })),
      ).rejects.toMatchObject({ status: 404 });
      await admin.query(`UPDATE "Agency" SET settings = settings - 'visibility' WHERE id = $1`, [
        agencyA,
      ]);

      const page = await inA((tx) => listPositions(tx, lead, { limit: 1, q: 'List ' }));
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
      const next = await inA((tx) =>
        listPositions(tx, lead, { limit: 1, q: 'List ', cursor: page.nextCursor! }),
      );
      expect(next.items[0]!.id).not.toBe(page.items[0]!.id);
      const byStatus = await inA((tx) =>
        listPositions(tx, lead, { limit: 100, status: 'sourcing', q: 'List ' }),
      );
      expect(byStatus.items).toEqual([]);
    });
  });
});
