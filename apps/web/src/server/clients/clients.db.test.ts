// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import {
  addContact,
  createClient,
  getClient,
  listClients,
  normalizeName,
  removeContact,
  updateClient,
  updateContact,
} from './service';

describe('normalizeName', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeName('Acme, Inc.')).toBe(normalizeName('  ACME   inc'));
    expect(normalizeName('Acme')).not.toBe(normalizeName('Acme Corp'));
  });
});

describe.skipIf(!dbAvailable())('clients and contacts (T-1-01)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let a: AgencyActor;
  let b: AgencyActor;
  const inA = <T>(
    fn: (tx: Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0]) => Promise<T>,
  ) => appScope(handle).withAgency(agencyA, fn);
  const inB = <T>(
    fn: (tx: Parameters<Parameters<ReturnType<typeof appScope>['withAgency']>[1]>[0]) => Promise<T>,
  ) => appScope(handle).withAgency(agencyB, fn);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    agencyA = await createAgency(admin, 'Clients A');
    agencyB = await createAgency(admin, 'Clients B');
    a = { kind: 'agency', userId: randomUUID(), agencyId: agencyA, role: 'recruiter' };
    b = { kind: 'agency', userId: randomUUID(), agencyId: agencyB, role: 'recruiter' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('creates a client, hints at a same-name client without blocking, and logs it', async () => {
    const first = await inA((tx) => createClient(tx, a, { name: 'Northwind Traders' }));
    expect(first.similar).toEqual([]);
    const second = await inA((tx) => createClient(tx, a, { name: 'northwind  traders.' }));
    expect(second.similar).toEqual([{ id: first.client.id, name: 'Northwind Traders' }]);
    expect(second.client.id).not.toBe(first.client.id);
    // The same name in another agency is not a hint (and cannot even be seen).
    expect((await inB((tx) => createClient(tx, b, { name: 'Northwind Traders' }))).similar).toEqual(
      [],
    );
    const log = await admin.query(
      `SELECT count(*)::int AS n FROM "ActivityLog" WHERE "entityId" = $1 AND action = 'client.created'`,
      [first.client.id],
    );
    expect(log.rows[0].n).toBe(1);
  });

  it('lists A to Z with search, paging and archived clients hidden by default', async () => {
    const names = ['Zeta Labs', 'Alpha Labs', 'Mid Labs'];
    for (const name of names) await inA((tx) => createClient(tx, a, { name }));
    const labs = await inA((tx) =>
      listClients(tx, { limit: 2, q: 'labs', includeArchived: false }),
    );
    expect(labs.items.map((c) => c.name)).toEqual(['Alpha Labs', 'Mid Labs']);
    expect(labs.nextCursor).toBeTruthy();
    const rest = await inA((tx) =>
      listClients(tx, { limit: 2, q: 'labs', cursor: labs.nextCursor!, includeArchived: false }),
    );
    expect(rest.items.map((c) => c.name)).toEqual(['Zeta Labs']);
    const alpha = labs.items[0]!;
    await inA((tx) => updateClient(tx, a, alpha.id, { archived: true }));
    const visible = await inA((tx) =>
      listClients(tx, { limit: 50, q: 'labs', includeArchived: false }),
    );
    expect(visible.items.map((c) => c.name)).not.toContain('Alpha Labs');
    const all = await inA((tx) => listClients(tx, { limit: 50, q: 'labs', includeArchived: true }));
    expect(all.items.map((c) => c.name)).toContain('Alpha Labs');
    const restored = await inA((tx) => updateClient(tx, a, alpha.id, { archived: false }));
    expect(restored.archivedAt).toBeNull();
  });

  it('does not show clients across agencies and 404s on a foreign id', async () => {
    const mine = await inA((tx) => createClient(tx, a, { name: 'Only In A' }));
    await expect(inB((tx) => getClient(tx, mine.client.id))).rejects.toMatchObject({ status: 404 });
    await expect(
      inB((tx) => updateClient(tx, b, mine.client.id, { name: 'Hijack' })),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      (await inB((tx) => listClients(tx, { limit: 100, includeArchived: true }))).items.map(
        (c) => c.id,
      ),
    ).not.toContain(mine.client.id);
  });

  describe('contacts', () => {
    it('adds, edits (including clearing a field) and removes contacts, sorted by name', async () => {
      const { client } = await inA((tx) => createClient(tx, a, { name: 'Contacts Co' }));
      const zed = await inA((tx) =>
        addContact(tx, a, client.id, {
          name: 'Zed Park',
          title: 'CTO',
          email: 'zed@example.com',
          phone: '+82 10 1234 5678',
        }),
      );
      await inA((tx) => addContact(tx, a, client.id, { name: 'Amy Lee' }));
      expect((await inA((tx) => getClient(tx, client.id))).contacts.map((c) => c.name)).toEqual([
        'Amy Lee',
        'Zed Park',
      ]);
      const edited = await inA((tx) =>
        updateContact(tx, client.id, zed.id, { title: null, email: 'zed@corp.example' }),
      );
      expect(edited).toMatchObject({
        title: null,
        email: 'zed@corp.example',
        phone: '+82 10 1234 5678',
      });
      await inA((tx) => removeContact(tx, a, client.id, zed.id));
      expect((await inA((tx) => getClient(tx, client.id))).contacts.map((c) => c.name)).toEqual([
        'Amy Lee',
      ]);
    });

    it('refuses a contact under the wrong client and adding to an archived client', async () => {
      const one = (await inA((tx) => createClient(tx, a, { name: 'One Corp' }))).client;
      const two = (await inA((tx) => createClient(tx, a, { name: 'Two Corp' }))).client;
      const c = await inA((tx) => addContact(tx, a, one.id, { name: 'Pat Kim' }));
      await expect(
        inA((tx) => updateContact(tx, two.id, c.id, { name: 'Pat K' })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(inA((tx) => removeContact(tx, a, two.id, c.id))).rejects.toMatchObject({
        status: 404,
      });
      await inA((tx) => updateClient(tx, a, two.id, { archived: true }));
      await expect(
        inA((tx) => addContact(tx, a, two.id, { name: 'Late Add' })),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('will not remove a contact who is a position hiring manager', async () => {
      const { client } = await inA((tx) => createClient(tx, a, { name: 'Hiring Co' }));
      const manager = await inA((tx) => addContact(tx, a, client.id, { name: 'Hana Choi' }));
      await inA((tx) =>
        tx.position.create({
          data: {
            agencyId: agencyA,
            clientId: client.id,
            ownerId: a.userId,
            hiringManagerId: manager.id,
            title: 'Engineer',
            location: 'Seoul',
            matchingWeights: {},
          },
        }),
      );
      await expect(inA((tx) => removeContact(tx, a, client.id, manager.id))).rejects.toMatchObject({
        status: 409,
      });
      expect((await inA((tx) => getClient(tx, client.id))).positionCount).toBe(1);
    });
  });
});
