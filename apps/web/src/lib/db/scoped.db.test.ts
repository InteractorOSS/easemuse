// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import type { DbHandle } from './client';

describe.skipIf(!dbAvailable())('withAgency (RLS tenant isolation)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let scope: ReturnType<typeof appScope>;
  let agencyA: string;
  let agencyB: string;
  const agencies: string[] = [];
  const users: string[] = [];

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(1); // a pool of ONE connection: every test shares it (TR-007)
    scope = appScope(handle);
    agencyA = await createAgency(admin, 'A');
    agencyB = await createAgency(admin, 'B');
    agencies.push(agencyA, agencyB);
    for (const id of [agencyA, agencyB]) {
      await scope.withAgency(id, (tx) =>
        tx.client.createMany({
          data: [1, 2, 3].map((n) => ({ agencyId: id, name: `client ${n}` })),
        }),
      );
    }
  });

  afterAll(async () => {
    await cleanup(admin, { agencies, users });
    await admin.end();
    await handle.close();
  });

  it("returns only the active agency's rows, even with no agencyId in the where clause", async () => {
    const rows = await scope.withAgency(agencyA, (tx) => tx.client.findMany());
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.agencyId === agencyA)).toBe(true);
  });

  it("cannot read another agency's rows even when asking for them by agencyId", async () => {
    const rows = await scope.withAgency(agencyA, (tx) =>
      tx.client.findMany({ where: { agencyId: agencyB } }),
    );
    expect(rows).toEqual([]);
  });

  it('covers raw SQL too', async () => {
    const rows = await scope.withAgency(
      agencyA,
      (tx) => tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Client"`,
    );
    expect(rows[0]?.n).toBe(3);
  });

  it('refuses to insert a row for another agency', async () => {
    await expect(
      scope.withAgency(agencyA, (tx) =>
        tx.client.create({ data: { agencyId: agencyB, name: 'smuggled' } }),
      ),
    ).rejects.toThrow();
  });

  it("cannot update or delete another agency's rows", async () => {
    const victim = await scope.withAgency(agencyB, (tx) => tx.client.findFirstOrThrow());
    const updated = await scope.withAgency(agencyA, (tx) =>
      tx.client.updateMany({ where: { id: victim.id }, data: { name: 'hijacked' } }),
    );
    const deleted = await scope.withAgency(agencyA, (tx) =>
      tx.client.deleteMany({ where: { id: victim.id } }),
    );
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
    const stillThere = await scope.withAgency(agencyB, (tx) =>
      tx.client.findUnique({ where: { id: victim.id } }),
    );
    expect(stillThere?.name).not.toBe('hijacked');
  });

  it('sees nothing without a context, on a connection that served scoped work before', async () => {
    await scope.withAgency(agencyA, (tx) => tx.client.findMany());
    const rows = await handle.prisma.$queryRaw<unknown[]>`SELECT 1 FROM "Client"`;
    expect(rows).toEqual([]);
  });

  it('keeps two agencies apart under 200 concurrent transactions on a pool of one', async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) => {
        const agency = i % 2 === 0 ? agencyA : agencyB;
        return scope.withAgency(agency, async (tx) => ({
          agency,
          rows: await tx.client.findMany(),
        }));
      }),
    );
    for (const { agency, rows } of results) {
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.agencyId === agency)).toBe(true);
    }
  });

  it('rolls the transaction back when the callback throws', async () => {
    await expect(
      scope.withAgency(agencyA, async (tx) => {
        await tx.client.create({ data: { agencyId: agencyA, name: 'rolled back' } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await scope.withAgency(agencyA, (tx) =>
      tx.client.findMany({ where: { name: 'rolled back' } }),
    );
    expect(rows).toEqual([]);
  });

  it('rejects a malformed agency id before touching the database', async () => {
    await expect(scope.withAgency('x\'; DROP TABLE "Client"; --', async () => 1)).rejects.toThrow();
    await expect(scope.withUser('not-a-uuid', async () => 1)).rejects.toThrow();
  });

  describe('pre-agency lookups (withUser)', () => {
    it("lists a user's own memberships across agencies and nothing else", async () => {
      const userId = await createUser(admin);
      const otherUser = await createUser(admin);
      users.push(userId, otherUser);
      await scope.withAgency(agencyA, (tx) =>
        tx.membership.create({ data: { agencyId: agencyA, userId } }),
      );
      await scope.withAgency(agencyB, (tx) =>
        tx.membership.create({ data: { agencyId: agencyB, userId } }),
      );
      await scope.withAgency(agencyB, (tx) =>
        tx.membership.create({ data: { agencyId: agencyB, userId: otherUser } }),
      );

      const mine = await scope.withUser(userId, async (tx) => ({
        memberships: await tx.membership.findMany(),
        clients: await tx.client.findMany(),
      }));
      expect(mine.memberships.map((m) => m.agencyId).sort()).toEqual([agencyA, agencyB].sort());
      expect(mine.memberships.every((m) => m.userId === userId)).toBe(true);
      expect(mine.clients).toEqual([]);
    });

    it('is read-only: a user cannot create a membership through the user policy', async () => {
      const userId = await createUser(admin);
      users.push(userId);
      await expect(
        scope.withUser(userId, (tx) =>
          tx.membership.create({ data: { agencyId: agencyA, userId } }),
        ),
      ).rejects.toThrow();
    });
  });

  it('accepts a random uuid for an agency that does not exist (no rows, no error)', async () => {
    const rows = await scope.withAgency(randomUUID(), (tx) => tx.client.findMany());
    expect(rows).toEqual([]);
  });
});
