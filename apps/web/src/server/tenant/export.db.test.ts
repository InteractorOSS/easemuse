// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AgencyActor } from '@easemuse/core';
import { closeDb } from '@/lib/db';
import type { DbHandle } from '@/lib/db/client';
import type { ScopedTx } from '@/lib/db';
import {
  adminClient,
  appHandle,
  appScope,
  cleanup,
  createAgency,
  createUser,
  dbAvailable,
} from '@/test/db';
import { TEST_DATABASE_URL } from '@/test/db-env';
import { populateAgency } from '@/test/populate-agency';
import type { JobContext } from '@/worker/registry';
import {
  getCompletedExportFile,
  listTenantExports,
  requestTenantExport,
  runTenantExportJob,
} from './export';
import { EXPORT_SKIPPED_TABLES, TENANT_TABLES } from './tables';

vi.mock('@/lib/queue', () => ({
  enqueue: async () => ({ jobRunId: crypto.randomUUID(), deduplicated: false }),
}));

describe.skipIf(!dbAvailable())('tenant export (T-13-09, FR-TEN-06)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let agencyA: string;
  let agencyB: string;
  let userA: string;
  let userB: string;
  let actorA: AgencyActor;
  let actorB: AgencyActor;
  const users: string[] = [];

  const ctxFor = (agencyId: string, exportId: string, userId: string): JobContext => ({
    jobRunId: randomUUID(),
    agencyId,
    requestedById: userId,
    data: { exportId },
    attempt: 1,
    withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => appScope(handle).withAgency(agencyId, fn),
    progress: async () => undefined,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    admin = await adminClient();
    handle = appHandle(3);
    agencyA = await createAgency(admin, 'Export A');
    agencyB = await createAgency(admin, 'Export B');
    [userA, userB] = [await createUser(admin), await createUser(admin)];
    users.push(userA, userB);
    await admin.query(
      `UPDATE "User" SET email = 'exporter-a@example.test', name = 'Export Admin' WHERE id = $1`,
      [userA],
    );
    await populateAgency(admin, { agencyId: agencyA, userId: userA });
    await populateAgency(admin, { agencyId: agencyB, userId: userB });
    // A real stored file, to prove the bytes travel.
    const bytes = Buffer.from('Jane Doe, HR Director');
    const file = await admin.query(
      `INSERT INTO "FileObject" (id, "agencyId", store, filename, "contentType", "sizeBytes", sha256, "updatedAt")
       VALUES (gen_random_uuid(), $1, 'db', 'resume.txt', 'text/plain', $2, $3, now()) RETURNING id`,
      [agencyA, bytes.length, createHash('sha256').update(bytes).digest('hex')],
    );
    await admin.query(
      `INSERT INTO "FileBlob" (id, "agencyId", "fileId", bytes) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [agencyA, file.rows[0].id, bytes],
    );
    // The generic seed also made an export row; remove A's so the first real request is not "already running".
    await admin.query(`DELETE FROM "TenantExport" WHERE "agencyId" = $1`, [agencyA]);
    actorA = { kind: 'agency', userId: userA, agencyId: agencyA, role: 'admin' };
    actorB = { kind: 'agency', userId: userB, agencyId: agencyB, role: 'admin' };
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB], users });
    await admin.end();
    await handle.close();
    await closeDb();
  });

  it('builds a ZIP with every table of the agency, its files, a manifest and a README, and nothing of another agency', async () => {
    const exportRow = await requestTenantExport(actorA);
    expect(exportRow.status).toBe('queued');
    const now = new Date('2026-10-07T12:00:00Z');
    await runTenantExportJob(ctxFor(agencyA, exportRow.id, userA), { store: null, now });

    const [done] = await listTenantExports(actorA);
    expect(done).toMatchObject({ id: exportRow.id, status: 'completed' });
    expect(done!.sizeBytes).toBeGreaterThan(500);

    const fileId = await appScope(handle).withAgency(
      agencyA,
      async (tx) => (await getCompletedExportFile(tx, actorA, exportRow.id)).fileId,
    );
    const blob = await admin.query('SELECT bytes FROM "FileBlob" WHERE "fileId" = $1', [fileId]);
    const zip = await JSZip.loadAsync(blob.rows[0].bytes);
    const names = Object.keys(zip.files);
    expect(names).toEqual(
      expect.arrayContaining(['README.md', 'manifest.json', 'agency.json', 'users.json']),
    );

    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest).toMatchObject({
      format: 'easemuse-tenant-export',
      version: 1,
      agency: { id: agencyA },
    });

    // Every table (except the one whose bytes go into files/) is written with the row count the database has.
    for (const table of TENANT_TABLES) {
      if ((EXPORT_SKIPPED_TABLES as readonly string[]).includes(table)) continue;
      const rows = await admin.query(
        `SELECT count(*)::int AS n FROM "${table}" WHERE "agencyId" = $1`,
        [agencyA],
      );
      const file = zip.file(`data/${table}.ndjson`);
      expect(file, table).not.toBeNull();
      const lines = (await file!.async('string'))
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      expect(lines.length, table).toBe(manifest.tables[table]);
      // These grow while the export itself runs (its own log entries and row); the rest are exact.
      if (['ActivityLog', 'TenantExport', 'JobRun', 'FileObject', 'FileBlob'].includes(table)) {
        expect(lines.length, table).toBeLessThanOrEqual(rows.rows[0].n);
      } else {
        expect(lines.length, table).toBe(rows.rows[0].n);
      }
      for (const line of lines) expect(line.agencyId, table).toBe(agencyA);
    }

    // No credentials and no embeddings; the people of the agency are listed; the file bytes are there.
    expect(await zip.file('data/MemberInvite.ndjson')!.async('string')).not.toContain('tokenHash');
    expect(await zip.file('data/MagicLink.ndjson')!.async('string')).not.toContain('tokenHash');
    expect(await zip.file('data/ProfileEmbedding.ndjson')!.async('string')).not.toContain(
      '"embedding"',
    );
    expect(JSON.parse(await zip.file('users.json')!.async('string'))).toEqual([
      expect.objectContaining({ id: userA, email: 'exporter-a@example.test' }),
    ]);
    const stored = names.find((n) => n.endsWith('/resume.txt'));
    expect(stored).toBeTruthy();
    expect(await zip.file(stored!)!.async('string')).toBe('Jane Doe, HR Director');

    // Nothing from agency B anywhere in the archive.
    for (const name of names) {
      if (zip.files[name]!.dir || name.startsWith('files/')) continue;
      expect(await zip.file(name)!.async('string'), name).not.toContain(agencyB);
    }
  });

  it('allows only one export at a time, and records a failure instead of leaving it running', async () => {
    const first = await requestTenantExport(actorA);
    await expect(requestTenantExport(actorA)).rejects.toMatchObject({ status: 409 });
    await admin.query(`UPDATE "TenantExport" SET status = 'failed' WHERE id = $1`, [first.id]);
  });

  it("keeps only the newest exports, and another agency's admin cannot list or download them (RLS)", async () => {
    for (let i = 0; i < 3; i += 1) {
      const row = await requestTenantExport(actorA);
      await runTenantExportJob(ctxFor(agencyA, row.id, userA), { store: null });
    }
    const completed = (await listTenantExports(actorA)).filter((e) => e.status === 'completed');
    expect(completed).toHaveLength(2);
    // B only sees its own (seeded) row, never A's.
    const seenByB = await listTenantExports(actorB);
    expect(seenByB).toHaveLength(1);
    expect(completed.map((e) => e.id)).not.toContain(seenByB[0]!.id);
    await expect(
      appScope(handle).withAgency(agencyB, (tx) =>
        getCompletedExportFile(tx, actorB, completed[0]!.id),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
