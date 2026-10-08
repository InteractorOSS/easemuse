// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import type { DbHandle } from '@/lib/db/client';
import { createAuthorizers } from './authorizers';
import { membershipLoader } from './membership';

describe.skipIf(!dbAvailable())('authorizeAgency with real memberships (RLS)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let memberOfA: string;
  let deactivated: string;
  let outsider: string;

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(1);
    agencyA = await createAgency(admin, 'A');
    agencyB = await createAgency(admin, 'B');
    [memberOfA, deactivated, outsider] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ] as [string, string, string];
    const scope = appScope(handle);
    await scope.withAgency(agencyA, (tx) =>
      tx.membership.createMany({
        data: [
          { agencyId: agencyA, userId: memberOfA, role: 'lead' },
          { agencyId: agencyA, userId: deactivated, role: 'admin', active: false },
        ],
      }),
    );
  });

  afterAll(async () => {
    await cleanup(admin, {
      agencies: [agencyA, agencyB],
      users: [memberOfA, deactivated, outsider],
    });
    await admin.end();
    await handle.close();
  });

  const authFor = (userId: string) => {
    const agencies = new Map([
      ['a', { id: agencyA, slug: 'a', name: 'A', status: 'active' as const }],
      ['b', { id: agencyB, slug: 'b', name: 'B', status: 'active' as const }],
    ]);
    return createAuthorizers({
      getSession: async () => ({ userId, mfa: true }),
      getUser: async () => null,
      getAgency: async (ref) => agencies.get(ref) ?? null,
      loadMembership: membershipLoader(appScope(handle)),
      mfaEnforcement: () => 'off',
      log: () => undefined,
      loadSupportGrant: async () => null,
      requestInfo: async () => null,
      recordSupportView: async () => undefined,
    });
  };

  it('lets a member in with their stored role', async () => {
    const result = await authFor(memberOfA).authorizeAgency('a');
    expect(result).toMatchObject({ role: 'lead', actor: { agencyId: agencyA } });
  });

  it("returns 404 for another agency's members, deactivated members and outsiders", async () => {
    for (const [userId, ref] of [
      [memberOfA, 'b'],
      [deactivated, 'a'],
      [outsider, 'a'],
    ] as const) {
      const res = await authFor(userId).authorizeAgency(ref);
      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(404);
    }
  });

  it('enforces roles against the stored role', async () => {
    const res = await authFor(memberOfA).authorizeAgency('a', { roles: ['admin'] });
    expect((res as Response).status).toBe(403);
  });
});
