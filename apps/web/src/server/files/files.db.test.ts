// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient, appHandle, appScope, cleanup, createAgency, dbAvailable } from '@/test/db';
import type { DbHandle } from '@/lib/db/client';
import { makePdf, RESUME_LINES } from '@/test/fixtures';
import { readOriginal, storeOriginal } from '@/server/documents/store';
import { openFileForDownload, saveGeneratedFile } from './files';
import { createMemoryObjectStore } from './object-store';

describe.skipIf(!dbAvailable())('file storage (RLS)', () => {
  let admin: pg.Client;
  let handle: DbHandle;
  let scope: ReturnType<typeof appScope>;
  let agencyA: string;
  let agencyB: string;
  const pdf = makePdf(RESUME_LINES);

  beforeAll(async () => {
    admin = await adminClient();
    handle = appHandle(2);
    scope = appScope(handle);
    agencyA = await createAgency(admin, 'A');
    agencyB = await createAgency(admin, 'B');
  });
  afterAll(async () => {
    await cleanup(admin, { agencies: [agencyA, agencyB] });
    await admin.end();
    await handle.close();
  });

  it('stores an original with its sha256 and reads the same bytes back', async () => {
    const stored = await scope.withAgency(agencyA, (tx) =>
      storeOriginal(tx, {
        agencyId: agencyA,
        filename: 'Jane Doe.pdf',
        bytes: pdf,
        createdById: null,
      }),
    );
    expect(stored).toMatchObject({
      filename: 'Jane Doe.pdf',
      contentType: 'application/pdf',
      sizeBytes: pdf.byteLength,
      duplicate: false,
    });
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/);
    const read = await scope.withAgency(agencyA, (tx) => readOriginal(tx, stored.id));
    expect(Buffer.compare(read.bytes, Buffer.from(pdf))).toBe(0);
  });

  it('does not store the same bytes twice in one agency, but does in another', async () => {
    const first = await scope.withAgency(agencyA, (tx) =>
      storeOriginal(tx, { agencyId: agencyA, filename: 'a.pdf', bytes: pdf, createdById: null }),
    );
    const again = await scope.withAgency(agencyA, (tx) =>
      storeOriginal(tx, {
        agencyId: agencyA,
        filename: 'renamed.pdf',
        bytes: pdf,
        createdById: null,
      }),
    );
    expect(again).toMatchObject({ id: first.id, duplicate: true });
    const other = await scope.withAgency(agencyB, (tx) =>
      storeOriginal(tx, { agencyId: agencyB, filename: 'a.pdf', bytes: pdf, createdById: null }),
    );
    expect(other.id).not.toBe(first.id);
    expect(other.duplicate).toBe(false);
  });

  it("hides one agency's files from another (404, not 403)", async () => {
    const stored = await scope.withAgency(agencyA, (tx) =>
      storeOriginal(tx, {
        agencyId: agencyA,
        filename: 'secret.pdf',
        bytes: makePdf(['only for A']),
        createdById: null,
      }),
    );
    await expect(
      scope.withAgency(agencyB, (tx) => readOriginal(tx, stored.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      scope.withAgency(agencyB, (tx) =>
        openFileForDownload(tx, null, { agencyId: agencyB, fileId: stored.id }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects oversized, unsupported and empty uploads before touching the database', async () => {
    const run = (bytes: Uint8Array, filename = 'x.pdf') =>
      scope.withAgency(agencyA, (tx) =>
        storeOriginal(tx, { agencyId: agencyA, filename, bytes, createdById: null }),
      );
    await expect(run(new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toMatchObject({ status: 413 });
    await expect(run(Uint8Array.from([0, 1, 2]), 'x.bin')).rejects.toMatchObject({ status: 415 });
    await expect(run(new Uint8Array(0))).rejects.toMatchObject({ status: 422 });
  });

  it('downloads originals as bytes and generated files as a short-lived redirect', async () => {
    const memory = createMemoryObjectStore();
    const original = await scope.withAgency(agencyA, (tx) =>
      storeOriginal(tx, {
        agencyId: agencyA,
        filename: 'cv.pdf',
        bytes: makePdf(['download me']),
        createdById: null,
      }),
    );
    const generated = await scope.withAgency(agencyA, (tx) =>
      saveGeneratedFile(tx, memory, {
        agencyId: agencyA,
        filename: 'Submission Report.pdf',
        contentType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3]),
        createdById: null,
      }),
    );
    expect(memory.objects.size).toBe(1);
    const [key] = [...memory.objects.keys()];
    expect(key).toBe(`easemuse/${agencyA}/generated/${generated.id}/Submission Report.pdf`);

    const bytes = await scope.withAgency(agencyA, (tx) =>
      openFileForDownload(tx, memory, { agencyId: agencyA, fileId: original.id }),
    );
    expect(bytes).toMatchObject({
      kind: 'bytes',
      filename: 'cv.pdf',
      contentType: 'application/pdf',
    });
    const redirect = await scope.withAgency(agencyA, (tx) =>
      openFileForDownload(tx, memory, { agencyId: agencyA, fileId: generated.id }),
    );
    expect(redirect).toMatchObject({ kind: 'redirect' });
    expect((redirect as { url: string }).url).toContain('expires=60');
  });

  it('refuses an object key outside the agency namespace even if a row is corrupted', async () => {
    const memory = createMemoryObjectStore();
    const generated = await scope.withAgency(agencyA, (tx) =>
      saveGeneratedFile(tx, memory, {
        agencyId: agencyA,
        filename: 'x.pdf',
        contentType: 'application/pdf',
        bytes: new Uint8Array([1]),
        createdById: null,
      }),
    );
    await admin.query(`UPDATE "FileObject" SET "externalRef" = $1 WHERE id = $2`, [
      `easemuse/${agencyB}/generated/z/x.pdf`,
      generated.id,
    ]);
    await expect(
      scope.withAgency(agencyA, (tx) =>
        openFileForDownload(tx, memory, { agencyId: agencyA, fileId: generated.id }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('does not create a FileObject when the upload to object storage fails', async () => {
    const failing = {
      ...createMemoryObjectStore(),
      put: async () => {
        throw new Error('s3 down');
      },
    };
    await expect(
      scope.withAgency(agencyA, (tx) =>
        saveGeneratedFile(tx, failing, {
          agencyId: agencyA,
          filename: 'lost.pdf',
          contentType: 'application/pdf',
          bytes: new Uint8Array([9]),
          createdById: null,
        }),
      ),
    ).rejects.toThrow('s3 down');
    const rows = await admin.query(
      `SELECT 1 FROM "FileObject" WHERE "agencyId" = $1 AND filename = 'lost.pdf'`,
      [agencyA],
    );
    expect(rows.rowCount).toBe(0);
  });
});
