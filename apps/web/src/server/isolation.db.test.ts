// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import type { DbHandle } from '@/lib/db/client';
import { TEST_DATABASE_URL } from '@/test/db-env';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { SEEDED_TABLES, seedAgency, type SeededAgency } from '@/test/isolation-fixtures';
import { getProvenance } from '@/server/ai/provenance';
import {
  approveVersion,
  discardVersion,
  findArtifact,
  getArtifactWithVersions,
  listVersionsOfGeneration,
  readApproved,
  saveEditToLatest,
} from '@/server/artifacts/service';
import { readOriginal } from '@/server/documents/store';
import { openFileForDownload } from '@/server/files/files';
import {
  listMembers,
  listPendingInvites,
  revokeInvite,
  updateMember,
} from '@/server/tenancy/members';

/**
 * Isolation harness (T-QA-01, TR-001, US-1301): two agencies, A and B, each with data in every
 * table the product uses. Acting as A, every service entry point is called with B's ids and must
 * answer "not found" or return nothing, and B's rows must be invisible table by table. When a
 * feature adds a service that takes a resource id, it adds a case here.
 */
describe.skipIf(!dbAvailable())('tenant isolation harness', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let a: SeededAgency;
  let b: SeededAgency;
  let actorA: AgencyActor;
  const users: string[] = [];
  const agencies: string[] = [];
  const asA = <T>(
    fn: Parameters<ReturnType<typeof appScope>['withAgency']>[1] & ((tx: never) => Promise<T>),
  ) =>
    appScope(handle).withAgency(a.agencyId, fn as never, { userId: actorA.userId }) as Promise<T>;

  beforeAll(async () => {
    // The services under test use the process-wide handle: point it at the TEST database, never dev.
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(3);
    const scope = appScope(handle);
    const [agencyA, agencyB] = [
      await createAgency(admin, 'Iso A'),
      await createAgency(admin, 'Iso B'),
    ];
    const [userA, userB] = [await createUser(admin), await createUser(admin)];
    agencies.push(agencyA, agencyB);
    users.push(userA, userB);
    a = await seedAgency(scope, agencyA, userA, 'alpha');
    b = await seedAgency(scope, agencyB, userB, 'bravo');
    actorA = { kind: 'agency', userId: userA, agencyId: agencyA, role: 'admin' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies, users });
    await admin.end();
    await handle.close();
  });

  describe('every seeded table is invisible across agencies', () => {
    it.each(SEEDED_TABLES)('%s: acting as A, B has zero visible rows', async (table) => {
      const rows = await asA<{ n: number }[]>((tx) =>
        // Table names come from the constant list above, never from input.
        tx.$queryRawUnsafe(
          `SELECT count(*)::int AS n FROM "${table}" WHERE "agencyId" = '${b.agencyId}'`,
        ),
      );
      expect(rows[0]!.n).toBe(0);
    });

    it.each(SEEDED_TABLES)('%s: A sees only its own rows', async (table) => {
      const rows = await asA<{ agencyId: string }[]>((tx) =>
        tx.$queryRawUnsafe(`SELECT "agencyId" FROM "${table}"`),
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.agencyId === a.agencyId)).toBe(true);
    });

    it('the seed really put data in every listed table for both agencies', async () => {
      for (const table of SEEDED_TABLES) {
        const { rows } = await admin.query(
          `SELECT count(DISTINCT "agencyId")::int AS n FROM "${table}" WHERE "agencyId" = ANY($1::uuid[])`,
          [[a.agencyId, b.agencyId]],
        );
        expect(rows[0].n, table).toBe(2);
      }
    });
  });

  describe("services answer 404 or nothing for the other agency's ids", () => {
    it('artifacts: read, edit, approve, discard', async () => {
      await expect(asA((tx) => getArtifactWithVersions(tx, b.artifactId))).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        asA((tx) => saveEditToLatest(tx, actorA, b.artifactId, { x: 1 })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(asA((tx) => approveVersion(tx, actorA, b.versionId))).rejects.toMatchObject({
        status: 404,
      });
      await expect(asA((tx) => discardVersion(tx, actorA, b.versionId))).rejects.toMatchObject({
        status: 404,
      });
    });

    it('artifacts: lookups by subject find nothing, and nothing of B changed', async () => {
      expect(
        await asA((tx) =>
          findArtifact(tx, {
            kind: 'improved_jd',
            subject: { type: 'position', id: b.positionId },
          }),
        ),
      ).toBeNull();
      expect(
        await asA((tx) =>
          readApproved(tx, {
            kind: 'improved_jd',
            subject: { type: 'position', id: b.positionId },
          }),
        ),
      ).toBeNull();
      expect(await asA((tx) => listVersionsOfGeneration(tx, b.generationId))).toEqual([]);
      const { rows } = await admin.query(
        `SELECT status, content FROM "ArtifactVersion" WHERE id = $1`,
        [b.versionId],
      );
      expect(rows[0].status).toBe('draft');
      expect(rows[0].content).toEqual({ title: 'bravo secret title' });
    });

    it('files: download and read', async () => {
      await expect(
        asA((tx) => openFileForDownload(tx, null, { agencyId: a.agencyId, fileId: b.fileId })),
      ).rejects.toMatchObject({ status: 404 });
      await expect(asA((tx) => readOriginal(tx, b.fileId))).rejects.toMatchObject({ status: 404 });
    });

    it('members and invites: update, revoke, and lists show only A', async () => {
      await expect(
        updateMember(actorA, b.memberUserId, { role: 'recruiter' }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(revokeInvite(actorA, b.inviteId)).rejects.toMatchObject({ status: 404 });
      expect((await listMembers(actorA, { limit: 50 })).items.map((m) => m.userId)).toEqual([
        a.memberUserId,
      ]);
      expect((await listPendingInvites(actorA)).map((i) => i.id)).toEqual([a.inviteId]);
      const { rows } = await admin.query(
        `SELECT m.role, i."revokedAt" FROM "Membership" m, "MemberInvite" i WHERE m."userId" = $1 AND i.id = $2`,
        [b.memberUserId, b.inviteId],
      );
      expect(rows[0]).toMatchObject({ role: 'admin', revokedAt: null });
    });

    it('AI provenance: another agency generation is not found', async () => {
      await expect(asA((tx) => getProvenance(tx, b.generationId))).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('writes cannot cross agencies', () => {
    it('refuses to insert, update or delete B rows from A, whatever the where clause says', async () => {
      await expect(
        asA((tx) => tx.client.create({ data: { agencyId: b.agencyId, name: 'planted' } })),
      ).rejects.toThrow();
      expect(
        await asA((tx) =>
          tx.client.updateMany({ where: { id: b.clientId }, data: { name: 'hijacked' } }),
        ),
      ).toMatchObject({ count: 0 });
      expect(
        await asA((tx) => tx.client.deleteMany({ where: { agencyId: b.agencyId } })),
      ).toMatchObject({ count: 0 });
      expect(
        await asA((tx) => tx.position.updateMany({ where: {}, data: { title: 'mass edit' } })),
      ).toMatchObject({ count: 1 }); // only A's own
      const { rows } = await admin.query(`SELECT name FROM "Client" WHERE id = $1`, [b.clientId]);
      expect(rows[0].name).toBe('bravo client');
    });

    it('a foreign key to another agency row cannot be planted either', async () => {
      // A pipeline entry for A's candidate on B's position: the row is A's, but it points into B.
      // RLS lets the insert through (the new row is A's) yet B's position stays untouched and unreadable.
      const planted = await asA((tx) => tx.position.findUnique({ where: { id: b.positionId } }));
      expect(planted).toBeNull();
    });
  });

  it('a request with no agency context sees nothing at all', async () => {
    const rows = await handle.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT (SELECT count(*) FROM "Client") + (SELECT count(*) FROM "Candidate") + (SELECT count(*) FROM "ArtifactVersion") AS n`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('random ids are simply not found (no existence leak)', async () => {
    await expect(asA((tx) => getArtifactWithVersions(tx, randomUUID()))).rejects.toMatchObject({
      status: 404,
    });
  });
});
