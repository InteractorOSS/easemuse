// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { createClient } from '@/server/clients/service';
import { addCandidateToPosition, transitionEntry } from '@/server/pipeline/service';
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
import { readyMatchEntry } from '@/test/match-fixtures';
import { getScreeningPrefill, planScreeningPrefill } from './prefill';
import { classifyEntry, getScreening, saveScreening } from './service';

describe.skipIf(!dbAvailable())('screening (T-4-01, T-4-02)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agency: string;
  let rec1: AgencyActor;
  let rec2: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agency, fn);
  let clientId: string;

  const newEntry = async () => {
    const position = await run((tx) =>
      createPosition(tx, rec1, { clientId, title: 'Role', location: 'Seoul' }),
    );
    await run((tx) =>
      tx.position.update({ where: { id: position.id }, data: { status: 'sourcing' } }),
    );
    const c = await run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: agency,
          fullName: `C ${randomUUID().slice(0, 6)}`,
          source: 'linkedin',
          createdById: rec1.userId,
        },
        select: { id: true },
      }),
    );
    return run((tx) => addCandidateToPosition(tx, rec1, position.id, { candidateId: c.id }));
  };

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agency = await createAgency(admin, 'Screen A');
    const [u1, u2] = [await createUser(admin), await createUser(admin)];
    for (const u of [u1, u2]) {
      await admin.query(
        `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'recruiter'::"AgencyRole", true, now())`,
        [agency, u],
      );
    }
    rec1 = { kind: 'agency', userId: u1, agencyId: agency, role: 'recruiter' };
    rec2 = { kind: 'agency', userId: u2, agencyId: agency, role: 'recruiter' };
    clientId = (await run((tx) => createClient(tx, rec1, { name: 'Screen Client' }))).client.id;
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agency] });
    await admin.end();
    await handle.close();
  });

  it('saves ratings and notes, keeps the others, and clears an emptied item', async () => {
    const entry = await newEntry();
    await run((tx) =>
      saveScreening(tx, rec1, entry.id, {
        items: {
          jobChanges: { rating: 'concern', notes: 'Three in two years' },
          teamSize: { notes: '12' },
        },
      }),
    );
    const second = await run((tx) =>
      saveScreening(tx, rec1, entry.id, {
        items: { teamSize: { rating: null, notes: '' }, location: { rating: 'strong' } },
      }),
    );
    expect(second.items).toEqual({
      jobChanges: { rating: 'concern', notes: 'Three in two years' },
      location: { rating: 'strong' },
    });
    expect((await run((tx) => getScreening(tx, rec1, entry.id))).items).toEqual(second.items);
  });

  it("lets only the entry's owner edit (others may read)", async () => {
    const entry = await newEntry();
    await expect(
      run((tx) => saveScreening(tx, rec2, entry.id, { items: { location: { rating: 'strong' } } })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(run((tx) => getScreening(tx, rec2, entry.id))).resolves.toMatchObject({
      items: {},
    });
  });

  it('classifies as a move to screened, with history, and allows reclassifying', async () => {
    const entry = await newEntry();
    const first = await run((tx) =>
      classifyEntry(tx, rec1, entry.id, { screeningClass: 'potential' }),
    );
    expect(first.screeningClass).toBe('potential');
    await run((tx) => classifyEntry(tx, rec1, entry.id, { screeningClass: 'priority' }));
    await expect(
      run((tx) => classifyEntry(tx, rec1, entry.id, { screeningClass: 'priority' })),
    ).rejects.toMatchObject({ status: 409 });
    const rows = await admin.query(
      `SELECT "toState", reason FROM "PipelineTransition" WHERE "entryId" = $1 ORDER BY "createdAt"`,
      [entry.id],
    );
    expect(rows.rows.map((r) => r.toState)).toEqual(['sourced', 'screened', 'screened']);
    expect(rows.rows[2].reason).toContain('potential');
  });

  it('only lets Priority and Potential candidates continue to outreach', async () => {
    const held = await newEntry();
    await run((tx) => classifyEntry(tx, rec1, held.id, { screeningClass: 'hold', reason: 'Wait' }));
    await expect(
      run((tx) => transitionEntry(tx, rec1, held.id, { to: 'contacting' })),
    ).rejects.toMatchObject({ status: 409 });
    const good = await newEntry();
    await run((tx) => classifyEntry(tx, rec1, good.id, { screeningClass: 'potential' }));
    await expect(
      run((tx) => transitionEntry(tx, rec1, good.id, { to: 'contacting' })),
    ).resolves.toBeTruthy();
  });

  it('plans suggestions only from a confirmed profile, without identity, and shows nothing until a draft exists', async () => {
    const { entry } = await readyMatchEntry(run, rec1, clientId);
    const plan = await run((tx) => planScreeningPrefill(tx, rec1, entry.id));
    expect(JSON.stringify(plan.input)).not.toMatch(/Alex Kim|alex@x/);
    expect(await run((tx) => getScreeningPrefill(tx, rec1, entry.id))).toBeNull();
    await expect(run((tx) => planScreeningPrefill(tx, rec2, entry.id))).rejects.toMatchObject({
      status: 403,
    });
    const bare = await newEntry();
    await expect(run((tx) => planScreeningPrefill(tx, rec1, bare.id))).rejects.toMatchObject({
      status: 409,
    });
  });
});
