// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlatformAdminActor } from '@easemuse/core';
import { closeDb, createScope, type Scope } from '@/lib/db';
import type { DbHandle } from '@/lib/db/client';
import { createMemoryObjectStore } from '@/server/files/object-store';
import {
  adminClient,
  cleanup,
  createAgency,
  createUser,
  dataRightsHandle,
  dbAvailable,
} from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { populateAgency } from '@/test/populate-agency';
import type { JobContext } from '@/worker/registry';
import {
  TENANT_DELETION_ATTEMPTS,
  approveTenantDeletion,
  cancelTenantDeletion,
  getLatestTenantDeletion,
  listTenantDeletions,
  requestTenantDeletion,
  runTenantDeletionJob,
} from './deletion';
import { KEPT_TABLES, TENANT_TABLES } from './tables';

const enqueued = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/lib/queue', () => ({
  enqueue: async (input: Record<string, unknown>) => {
    enqueued.push(input);
    return { jobRunId: crypto.randomUUID(), deduplicated: false };
  },
}));

describe.skipIf(!dbAvailable())('tenant deletion (T-13-10, FR-ADM-08, ADR-016)', () => {
  let admin: pg.Client;
  let drHandle: DbHandle;
  let scope: Scope;
  let agencyA: string;
  let agencyB: string;
  let slugA: string;
  let owner: PlatformAdminActor;
  let secondAdmin: PlatformAdminActor;
  let supporter: PlatformAdminActor;
  let onlyInA: string;
  let sharedUser: string;
  const users: string[] = [];
  const store = createMemoryObjectStore();
  const s3Key = (agencyId: string) => `easemuse/${agencyId}/generated/${randomUUID()}/x.pdf`;

  const ctxFor = (userId: string, deletionId: string, attempt = 1): JobContext => ({
    jobRunId: randomUUID(),
    agencyId: null,
    requestedById: userId,
    data: { deletionId },
    attempt,
    withAgency: async () => {
      throw new Error('a system job has no agency');
    },
    progress: async () => undefined,
  });
  const rowsOf = async (table: string, agencyId: string) =>
    (
      await admin.query(`SELECT count(*)::int AS n FROM "${table}" WHERE "agencyId" = $1`, [
        agencyId,
      ])
    ).rows[0].n as number;
  // The tables of THIS schema that have an agencyId, as the database catalog lists them. The test
  // database is shared with other branches, which may have migrated tables this schema does not know.
  const schemaModels = new Set(
    [
      ...readFileSync(path.resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8').matchAll(
        /^model (\w+) \{/gm,
      ),
    ].map((m) => m[1]),
  );
  const agencyTables = async () =>
    (
      await admin.query<{ table_name: string }>(
        `SELECT c.table_name FROM information_schema.columns c
          JOIN information_schema.tables t USING (table_schema, table_name)
          WHERE c.table_schema = 'public' AND c.column_name = 'agencyId' AND t.table_type = 'BASE TABLE'`,
      )
    ).rows
      .map((r) => r.table_name)
      .filter((name) => schemaModels.has(name));

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    drHandle = dataRightsHandle();
    scope = createScope(() => drHandle);
    const [o, s, sup, member, shared, other] = [
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
      await createUser(admin),
    ];
    users.push(o, s, sup, member, shared, other);
    for (const [id, role] of [
      [o, 'owner'],
      [s, 'admin'],
      [sup, 'support'],
    ]) {
      await admin.query(`UPDATE "User" SET "platformRole" = $2::"PlatformRole" WHERE id = $1`, [
        id,
        role,
      ]);
    }
    owner = { kind: 'platform_admin', userId: o, role: 'owner' };
    secondAdmin = { kind: 'platform_admin', userId: s, role: 'admin' };
    supporter = { kind: 'platform_admin', userId: sup, role: 'support' };
    onlyInA = member;
    sharedUser = shared;
    agencyA = await createAgency(admin, 'Delete A');
    agencyB = await createAgency(admin, 'Delete B');
    slugA = (await admin.query('SELECT slug FROM "Agency" WHERE id = $1', [agencyA])).rows[0].slug;
    await populateAgency(admin, { agencyId: agencyA, userId: member });
    await populateAgency(admin, { agencyId: agencyB, userId: other });
    // populateAgency made `member` a member of A and `other` a member of B. The shared user belongs to both.
    await admin.query(
      `INSERT INTO "Membership" (id, "agencyId", "userId", role, active, "updatedAt") VALUES
         (gen_random_uuid(), $1, $3, 'recruiter', true, now()),
         (gen_random_uuid(), $2, $3, 'recruiter', true, now())`,
      [agencyA, agencyB, shared],
    );
    // A stored object in object storage, to prove it is removed too.
    const key = s3Key(agencyA);
    await store.put(key, new Uint8Array([1, 2, 3]), 'application/pdf');
    await admin.query(
      `INSERT INTO "FileObject" (id, "agencyId", store, "externalRef", filename, "contentType", "sizeBytes", sha256, "updatedAt")
       VALUES (gen_random_uuid(), $1, 's3', $2, 'x.pdf', 'application/pdf', 3, 'abc', now())`,
      [agencyA, key],
    );
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB], users });
    await admin.query(`DELETE FROM "TenantDeletion" WHERE "tenantId" = ANY($1::uuid[])`, [
      [agencyA, agencyB],
    ]);
    await admin.end();
    await drHandle.close();
    await closeDb();
  });

  let deletionId: string;

  it('is refused for an agency that is still active, with the wrong URL name, and for a support administrator', async () => {
    await expect(requestTenantDeletion(owner, slugA, { confirmSlug: slugA })).rejects.toMatchObject(
      {
        status: 409,
      },
    );
    await admin.query(`UPDATE "Agency" SET status = 'suspended' WHERE id = $1`, [agencyA]);
    await expect(
      requestTenantDeletion(owner, slugA, { confirmSlug: 'nope' }),
    ).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      requestTenantDeletion(supporter, slugA, { confirmSlug: slugA }),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it('needs a second person: the requester cannot approve, and the approver types the name again', async () => {
    const requested = await requestTenantDeletion(owner, slugA, { confirmSlug: slugA });
    deletionId = requested.id;
    expect(requested).toMatchObject({ status: 'requested', tenantSlug: slugA });
    await expect(requestTenantDeletion(owner, slugA, { confirmSlug: slugA })).rejects.toMatchObject(
      {
        status: 409,
      },
    );
    await expect(
      approveTenantDeletion(owner, slugA, deletionId, { confirmSlug: slugA }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      approveTenantDeletion(secondAdmin, slugA, deletionId, { confirmSlug: 'wrong' }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      approveTenantDeletion(supporter, slugA, deletionId, { confirmSlug: slugA }),
    ).rejects.toMatchObject({ status: 403 });
    expect(enqueued).toHaveLength(0);

    const approved = await approveTenantDeletion(secondAdmin, slugA, deletionId, {
      confirmSlug: slugA,
    });
    expect(approved.status).toBe('approved');
    expect(enqueued).toEqual([
      expect.objectContaining({ queue: 'maintenance', name: 'tenant.delete', agencyId: null }),
    ]);
    await expect(
      approveTenantDeletion(secondAdmin, slugA, deletionId, { confirmSlug: slugA }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('removes every row of the agency from every table that has an agencyId, and nothing of another agency', async () => {
    const tables = (await agencyTables()).filter(
      (t) => !(KEPT_TABLES as readonly string[]).includes(t),
    );
    // Sanity: the agency really is populated everywhere before the job.
    for (const table of tables)
      expect(await rowsOf(table, agencyA), `${table} before`).toBeGreaterThan(0);
    const before = Object.fromEntries(
      await Promise.all(tables.map(async (t) => [t, await rowsOf(t, agencyB)] as const)),
    );
    const auditBefore = (
      await admin.query(`SELECT count(*)::int AS n FROM "PlatformAuditLog" WHERE "agencyId" = $1`, [
        agencyA,
      ])
    ).rows[0].n;

    await runTenantDeletionJob(ctxFor(secondAdmin.userId, deletionId), { scope, store });

    // The catalog, not our own list, decides what "every table" means: a table someone forgot would still hold rows.
    for (const table of tables) expect(await rowsOf(table, agencyA), `${table} after`).toBe(0);
    for (const table of tables)
      expect(await rowsOf(table, agencyB), `${table} of B`).toBe(before[table]);
    expect((await admin.query('SELECT 1 FROM "Agency" WHERE id = $1', [agencyA])).rowCount).toBe(0);
    expect((await admin.query('SELECT 1 FROM "Agency" WHERE id = $1', [agencyB])).rowCount).toBe(1);
    expect(TENANT_TABLES.length).toBe(tables.length);

    // People: the one who belonged to A only is gone; the shared one and the platform admins stay.
    const left = async (id: string) =>
      (await admin.query('SELECT 1 FROM "User" WHERE id = $1', [id])).rowCount;
    expect(await left(onlyInA)).toBe(0);
    expect(await left(sharedUser)).toBe(1);
    expect(await left(owner.userId)).toBe(1);

    // The stored object is gone, and the platform keeps its record.
    expect([...store.objects.keys()].filter((k) => k.includes(agencyA))).toEqual([]);
    const audit = await admin.query(
      `SELECT action FROM "PlatformAuditLog" WHERE "agencyId" = $1 ORDER BY "createdAt"`,
      [agencyA],
    );
    expect(audit.rowCount).toBeGreaterThanOrEqual(auditBefore);
    expect(audit.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'tenant.deletion.request',
        'tenant.deletion.approve',
        'tenant.deletion.complete',
      ]),
    );
    const record = await getLatestTenantDeletion(owner, agencyA);
    expect(record).toMatchObject({
      status: 'completed',
      tenantSlug: slugA,
      requestedByEmail: expect.any(String),
      approvedByEmail: expect.any(String),
    });
    expect(record!.rowsRemoved).toBeGreaterThan(40);
    expect((await listTenantDeletions(owner)).map((d) => d.id)).toContain(deletionId);
  });

  it('is safe to run again', async () => {
    await expect(
      runTenantDeletionJob(ctxFor(secondAdmin.userId, deletionId), { scope, store }),
    ).resolves.toBeUndefined();
  });

  it('can be cancelled before it runs, and a failed run resumes where it stopped', async () => {
    const agencyC = await createAgency(admin, 'Delete C');
    users.push();
    const [creator] = [await createUser(admin)];
    users.push(creator);
    await populateAgency(admin, { agencyId: agencyC, userId: creator });
    await admin.query(`UPDATE "Agency" SET status = 'suspended' WHERE id = $1`, [agencyC]);
    const slugC = (await admin.query('SELECT slug FROM "Agency" WHERE id = $1', [agencyC])).rows[0]
      .slug;

    const first = await requestTenantDeletion(owner, agencyC, { confirmSlug: slugC });
    expect((await cancelTenantDeletion(secondAdmin, agencyC, first.id)).status).toBe('cancelled');
    await expect(cancelTenantDeletion(owner, agencyC, first.id)).rejects.toMatchObject({
      status: 409,
    });

    const second = await requestTenantDeletion(owner, agencyC, { confirmSlug: slugC });
    await approveTenantDeletion(secondAdmin, agencyC, second.id, { confirmSlug: slugC });

    // Attempt 1 fails halfway: the record stays "running" and keeps its progress.
    let deletes = 0;
    const flaky: Scope = {
      withUser: scope.withUser,
      withAgency: (id, fn, options) =>
        scope.withAgency(
          id,
          async (tx) => {
            const result = await fn(tx);
            if (id === agencyC && ++deletes === 12) throw new Error('database went away');
            return result;
          },
          options,
        ),
    };
    await expect(
      runTenantDeletionJob(ctxFor(secondAdmin.userId, second.id, 1), { scope: flaky, store }),
    ).rejects.toThrow('database went away');
    const midway = await getLatestTenantDeletion(owner, agencyC);
    expect(midway).toMatchObject({ status: 'running' });
    expect(midway!.rowsRemoved).toBeGreaterThan(0);

    // Attempt 2 carries on and finishes.
    await runTenantDeletionJob(ctxFor(secondAdmin.userId, second.id, 2), { scope, store });
    expect((await getLatestTenantDeletion(owner, agencyC))?.status).toBe('completed');
    expect((await admin.query('SELECT 1 FROM "Agency" WHERE id = $1', [agencyC])).rowCount).toBe(0);
  });

  it('marks the record failed only after the last attempt', async () => {
    const agencyD = await createAgency(admin, 'Delete D');
    await admin.query(`UPDATE "Agency" SET status = 'suspended' WHERE id = $1`, [agencyD]);
    const slugD = (await admin.query('SELECT slug FROM "Agency" WHERE id = $1', [agencyD])).rows[0]
      .slug;
    const req = await requestTenantDeletion(owner, agencyD, { confirmSlug: slugD });
    await approveTenantDeletion(secondAdmin, agencyD, req.id, { confirmSlug: slugD });
    const broken: Scope = {
      withUser: scope.withUser,
      withAgency: async () => {
        throw new Error('boom');
      },
    };
    await expect(
      runTenantDeletionJob(ctxFor(secondAdmin.userId, req.id, 1), { scope: broken, store }),
    ).rejects.toThrow('boom');
    expect((await getLatestTenantDeletion(owner, agencyD))?.status).toBe('running');
    await expect(
      runTenantDeletionJob(ctxFor(secondAdmin.userId, req.id, TENANT_DELETION_ATTEMPTS), {
        scope: broken,
        store,
      }),
    ).rejects.toThrow('boom');
    expect(await getLatestTenantDeletion(owner, agencyD)).toMatchObject({
      status: 'failed',
      error: 'boom',
    });
    await cleanup(admin, { agencies: [agencyD] });
    await admin.query(`DELETE FROM "TenantDeletion" WHERE "tenantId" = $1`, [agencyD]);
  });
});
