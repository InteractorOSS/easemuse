// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
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
import { setDoNotContact } from './do-not-contact';
import { getCandidate } from './service';

describe.skipIf(!dbAvailable())('do not contact (T-2-11) and the candidate view (T-2-12)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let recruiter: AgencyActor;
  let owner: AgencyActor;
  let outsider: AgencyActor;
  type Tx = Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0];
  const run = <T>(fn: (tx: Tx) => Promise<T>) => appScope(handle).withAgency(agencyA, fn);
  const person = (status: 'active' | 'draft' | 'discarded' = 'active') =>
    run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: agencyA,
          fullName: 'Pat Person',
          source: 'linkedin',
          createdById: recruiter.userId,
          status,
        },
        select: { id: true },
      }),
    ).then((c) => c.id);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'DNC A');
    agencyB = await createAgency(admin, 'DNC B');
    const [u1, u2, u3] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    recruiter = { kind: 'agency', userId: u1, agencyId: agencyA, role: 'recruiter' };
    owner = { kind: 'agency', userId: u2, agencyId: agencyA, role: 'admin' };
    outsider = { kind: 'agency', userId: u3, agencyId: agencyB, role: 'admin' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('lets any member set the flag with a reason, and records the reason and time', async () => {
    const id = await person();
    const at = new Date('2026-10-07T10:00:00Z');
    const result = await run((tx) =>
      setDoNotContact(tx, recruiter, id, { value: true, reason: 'Asked us to stop' }, at),
    );
    expect(result).toEqual({ doNotContact: true, reason: 'Asked us to stop', at });
    const view = await run((tx) => getCandidate(tx, id));
    expect(view).toMatchObject({
      doNotContact: true,
      doNotContactReason: 'Asked us to stop',
      doNotContactAt: at,
    });
    const log = await admin.query(`SELECT action, data FROM "ActivityLog" WHERE "entityId" = $1`, [
      id,
    ]);
    expect(log.rows).toEqual([
      { action: 'candidate.do_not_contact_set', data: { reason: 'Asked us to stop' } },
    ]);
  });

  it('lets only an admin clear it, with a reason, and keeps the history on the timeline', async () => {
    const id = await person();
    await run((tx) =>
      setDoNotContact(tx, recruiter, id, { value: true, reason: 'Asked us to stop' }),
    );
    await expect(
      run((tx) =>
        setDoNotContact(tx, recruiter, id, { value: false, reason: 'Changed their mind' }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await run((tx) => getCandidate(tx, id))).doNotContact).toBe(true);
    const cleared = await run((tx) =>
      setDoNotContact(tx, owner, id, {
        value: false,
        reason: 'Candidate asked to hear from us again',
      }),
    );
    expect(cleared).toEqual({ doNotContact: false, reason: null, at: null });
    const log = await admin.query(
      `SELECT action, data FROM "ActivityLog" WHERE "entityId" = $1 ORDER BY "createdAt", id`,
      [id],
    );
    expect(log.rows.map((r) => [r.action, r.data.reason])).toEqual([
      ['candidate.do_not_contact_set', 'Asked us to stop'],
      ['candidate.do_not_contact_cleared', 'Candidate asked to hear from us again'],
    ]);
  });

  it('says so (409) when the flag is already in that state, and only works on confirmed candidates', async () => {
    const id = await person();
    await expect(
      run((tx) => setDoNotContact(tx, owner, id, { value: false, reason: 'No flag to clear' })),
    ).rejects.toMatchObject({ status: 409 });
    await run((tx) => setDoNotContact(tx, recruiter, id, { value: true, reason: 'First time' }));
    await expect(
      run((tx) => setDoNotContact(tx, recruiter, id, { value: true, reason: 'Second time' })),
    ).rejects.toMatchObject({ status: 409 });
    const draft = await person('draft');
    const discarded = await person('discarded');
    await expect(
      run((tx) => setDoNotContact(tx, recruiter, draft, { value: true, reason: 'Too early' })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      run((tx) => setDoNotContact(tx, recruiter, discarded, { value: true, reason: 'Gone' })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      run((tx) => setDoNotContact(tx, recruiter, randomUUID(), { value: true, reason: 'Nobody' })),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("does not reach another agency's candidate", async () => {
    const id = await person();
    await expect(
      appScope(handle).withAgency(agencyB, (tx) =>
        setDoNotContact(tx, outsider, id, { value: true, reason: 'Not mine' }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      appScope(handle).withAgency(agencyB, (tx) => getCandidate(tx, id)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('shows the positions a candidate is in', async () => {
    const id = await person();
    const { clientId, positionId } = await run(async (tx) => {
      const client = await tx.client.create({ data: { agencyId: agencyA, name: 'View Client' } });
      const position = await tx.position.create({
        data: {
          agencyId: agencyA,
          clientId: client.id,
          ownerId: recruiter.userId,
          title: 'View Role',
          location: 'Seoul',
          matchingWeights: {},
        },
      });
      await tx.pipelineEntry.create({
        data: {
          agencyId: agencyA,
          positionId: position.id,
          candidateId: id,
          ownerId: recruiter.userId,
        },
      });
      return { clientId: client.id, positionId: position.id };
    });
    void clientId;
    const view = await run((tx) => getCandidate(tx, id));
    expect(view.positions).toEqual([
      expect.objectContaining({
        positionId,
        title: 'View Role',
        clientName: 'View Client',
        state: 'sourced',
      }),
    ]);
  });
});
