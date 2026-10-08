// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import {
  TENANT_EXPORTS_KEPT,
  TENANT_EXPORT_MAX_BYTES,
  type AgencyActor,
  type TenantExportStatus,
} from '@easemuse/core';
import { withAgency, type ScopedTx } from '@/lib/db';
import { enqueue } from '@/lib/queue';
import { ApiError, notFound } from '@/lib/http/errors';
import { saveGeneratedFile } from '@/server/files/files';
import { getObjectStore, type ObjectStore } from '@/server/files/object-store';
import { sanitizeFilename } from '@/server/documents/store';
import { fileSourceFor } from '@/server/privacy/export';
import type { JobContext } from '@/worker/registry';
import {
  EXPORT_OMITTED_COLUMNS,
  EXPORT_SKIPPED_TABLES,
  TENANT_TABLES,
  quoteTable,
  type TenantTable,
} from './tables';

/**
 * Tenant export (T-13-09, FR-TEN-06, ADR-016): an agency admin asks for a ZIP of everything the agency
 * holds. It is built in the background from the same table list the deletion uses, so the two always
 * cover the same data. The ZIP is documented by the README and manifest inside it.
 */

export interface TenantExportView {
  id: string;
  status: TenantExportStatus;
  createdAt: Date;
  completedAt: Date | null;
  sizeBytes: number | null;
  tableCounts: Record<string, number> | null;
  error: string | null;
  jobRunId: string | null;
}

type Row = Awaited<ReturnType<ScopedTx['tenantExport']['findFirstOrThrow']>>;

const view = (row: Row): TenantExportView => ({
  id: row.id,
  status: row.status as TenantExportStatus,
  createdAt: row.createdAt,
  completedAt: row.completedAt,
  sizeBytes: row.sizeBytes,
  tableCounts: (row.tableCounts as Record<string, number> | null) ?? null,
  error: row.error,
  jobRunId: row.jobRunId,
});

/** A queued or running export that has not moved for this long is treated as dead, so a new one can start. */
const STALE_MS = 3 * 3_600_000;
const PAGE_ROWS = 2000;

export async function listTenantExports(actor: AgencyActor): Promise<TenantExportView[]> {
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const rows = await tx.tenantExport.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
      return rows.map(view);
    },
    { userId: actor.userId },
  );
}

/** Starts an export. One at a time per agency; the work happens in the worker. */
export async function requestTenantExport(
  actor: AgencyActor,
  now: Date = new Date(),
): Promise<TenantExportView> {
  const row = await withAgency(
    actor.agencyId,
    async (tx) => {
      const running = await tx.tenantExport.findFirst({
        where: {
          status: { in: ['queued', 'running'] },
          createdAt: { gt: new Date(now.getTime() - STALE_MS) },
        },
      });
      if (running) {
        throw new ApiError('conflict', 'An export is already being prepared', { status: 409 });
      }
      const created = await tx.tenantExport.create({
        data: { agencyId: actor.agencyId, requestedById: actor.userId, createdAt: now },
      });
      await tx.activityLog.create({
        data: {
          agencyId: actor.agencyId,
          actorType: 'user',
          actorId: actor.userId,
          action: 'tenant.export_requested',
          entityType: 'tenant_export',
          entityId: created.id,
          data: {},
        },
      });
      return created;
    },
    { userId: actor.userId },
  );
  try {
    const { jobRunId } = await enqueue({
      queue: 'documents',
      name: 'tenant.export',
      agencyId: actor.agencyId,
      requestedById: actor.userId,
      data: { exportId: row.id },
      idempotencyKey: `tenant.export:${row.id}`,
      attempts: 1,
    });
    return await withAgency(actor.agencyId, async (tx) =>
      view(await tx.tenantExport.update({ where: { id: row.id }, data: { jobRunId } })),
    );
  } catch (error) {
    await withAgency(actor.agencyId, (tx) =>
      tx.tenantExport.update({
        where: { id: row.id },
        data: { status: 'failed', error: 'enqueue_failed', completedAt: new Date() },
      }),
    );
    throw error;
  }
}

/** The file of a completed export, for the download route. Another agency's id is a plain 404 (RLS). */
export async function getCompletedExportFile(
  tx: ScopedTx,
  actor: AgencyActor,
  exportId: string,
): Promise<{ fileId: string }> {
  const row = await tx.tenantExport.findUnique({ where: { id: exportId } });
  if (!row || row.agencyId !== actor.agencyId || row.status !== 'completed' || !row.fileId) {
    throw notFound('Export');
  }
  await tx.activityLog.create({
    data: {
      agencyId: actor.agencyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'tenant.export_downloaded',
      entityType: 'tenant_export',
      entityId: row.id,
      data: {},
    },
  });
  return { fileId: row.fileId };
}

const README = `# EaseMuse tenant export

This ZIP holds everything your agency has in EaseMuse.

- manifest.json   when it was made, the agency, and how many rows each table has.
- agency.json     the agency record: name, URL name, region, plan, settings and branding.
- users.json      the people who are or were members: id, email, name, language.
- data/<Table>.ndjson
                  one JSON object per line, one file per table, as stored. Dates are ISO 8601
                  (UTC). Ids are UUIDs and link the files together: for example
                  PipelineEntry.candidateId is Candidate.id. One-time link hashes and search
                  embeddings are left out on purpose.
- files/<FileObject.id>/<name>
                  every stored file: resume and job description originals, generated PDFs and
                  Word files, the logo (not earlier exports). FileObject.ndjson lists them with
                  their type and checksum.
- missing-files.txt
                  only present if a stored file could not be read; lists its FileObject ids.

Nothing in this export is encrypted. Treat it as confidential candidate data.
`;

async function readPage(
  tx: ScopedTx,
  table: TenantTable,
  agencyId: string,
  after: string,
): Promise<{ id: string; json: string }[]> {
  const omitted = EXPORT_OMITTED_COLUMNS[table] ?? [];
  // `quoteTable` only accepts names from the fixed list; the values are bound parameters.
  return tx.$queryRawUnsafe<{ id: string; json: string }[]>(
    `SELECT t.id::text AS id, (to_jsonb(t) - $3::text[])::text AS json
       FROM ${quoteTable(table)} t
      WHERE t."agencyId" = $1::uuid AND t.id > $2::uuid
      ORDER BY t.id
      LIMIT ${PAGE_ROWS}`,
    agencyId,
    after,
    omitted,
  );
}

export interface BuiltTenantExport {
  zip: Buffer;
  tableCounts: Record<string, number>;
  missingFiles: string[];
}

/** Builds the ZIP. Every database read is its own short agency-scoped transaction. */
export async function buildTenantZip(
  run: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>,
  input: { agencyId: string; store: ObjectStore | null; now: Date },
): Promise<BuiltTenantExport> {
  const { agencyId } = input;
  const zip = new JSZip();
  const tableCounts: Record<string, number> = {};

  for (const table of TENANT_TABLES) {
    if ((EXPORT_SKIPPED_TABLES as readonly string[]).includes(table)) continue;
    const lines: string[] = [];
    let after = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const page = await run((tx) => readPage(tx, table, agencyId, after));
      for (const row of page) lines.push(row.json);
      if (page.length < PAGE_ROWS) break;
      after = page[page.length - 1]!.id;
    }
    tableCounts[table] = lines.length;
    if (lines.length > 0) zip.file(`data/${table}.ndjson`, lines.join('\n') + '\n');
  }

  const { agency, users } = await run(async (tx) => {
    const row = await tx.agency.findUnique({ where: { id: agencyId } });
    const memberIds = (
      await tx.membership.findMany({ where: { agencyId }, select: { userId: true } })
    ).map((m) => m.userId);
    // Users are platform rows; the agency's own people are found through its memberships.
    const people = await tx.$queryRawUnsafe<
      { id: string; email: string; name: string | null; locale: string | null }[]
    >(
      `SELECT id::text, email, name, locale FROM "User" WHERE id = ANY($1::uuid[]) ORDER BY email`,
      memberIds,
    );
    return { agency: row, users: people };
  });
  if (!agency) throw notFound('Agency');
  zip.file(
    'agency.json',
    JSON.stringify(
      {
        id: agency.id,
        slug: agency.slug,
        name: agency.name,
        status: agency.status,
        region: agency.region,
        plan: agency.plan,
        settings: agency.settings,
        branding: agency.branding,
        aiMonthlyBudgetUsd: agency.aiMonthlyBudgetUsd?.toString() ?? null,
        createdAt: agency.createdAt,
      },
      null,
      2,
    ),
  );
  zip.file('users.json', JSON.stringify(users, null, 2));

  // Files: read one at a time so a transaction never spans a download from object storage.
  // Earlier exports are files of the agency too; leaving them out keeps an export from containing the last one.
  const fileRows = await run(async (tx) => {
    const earlier = new Set(
      (await tx.tenantExport.findMany({ select: { fileId: true } })).flatMap((e) =>
        e.fileId ? [e.fileId] : [],
      ),
    );
    return (
      await tx.fileObject.findMany({ select: { id: true, filename: true }, orderBy: { id: 'asc' } })
    ).filter((f) => !earlier.has(f.id));
  });
  const missingFiles: string[] = [];
  let bytes = 0;
  for (const file of fileRows) {
    const content = await run((tx) => fileSourceFor(tx, input.store).read(file.id));
    if (!content) {
      missingFiles.push(file.id);
      continue;
    }
    bytes += content.bytes.byteLength;
    if (bytes > TENANT_EXPORT_MAX_BYTES) {
      throw new ApiError('export_too_large', 'This agency has too much data for one export', {
        status: 413,
      });
    }
    zip.file(`files/${file.id}/${sanitizeFilename(content.filename)}`, content.bytes);
  }
  if (missingFiles.length) zip.file('missing-files.txt', missingFiles.join('\n') + '\n');

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        format: 'easemuse-tenant-export',
        version: 1,
        exportedAt: input.now.toISOString(),
        agency: { id: agency.id, slug: agency.slug, name: agency.name },
        tables: tableCounts,
        files: { included: fileRows.length - missingFiles.length, missing: missingFiles.length },
      },
      null,
      2,
    ),
  );
  zip.file('README.md', README);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  if (buffer.byteLength > TENANT_EXPORT_MAX_BYTES) {
    throw new ApiError('export_too_large', 'This agency has too much data for one export', {
      status: 413,
    });
  }
  return { zip: buffer, tableCounts, missingFiles };
}

/** Keeps the ZIP where generated files go: object storage when configured, else in the database. */
async function storeZip(
  tx: ScopedTx,
  store: ObjectStore | null,
  input: { agencyId: string; slug: string; bytes: Buffer; createdById: string | null; now: Date },
): Promise<string> {
  const filename = `tenant-export-${input.slug}-${input.now.toISOString().slice(0, 10)}.zip`;
  if (store) {
    return (
      await saveGeneratedFile(tx, store, {
        agencyId: input.agencyId,
        filename,
        contentType: 'application/zip',
        bytes: input.bytes,
        createdById: input.createdById,
      })
    ).id;
  }
  const id = randomUUID();
  await tx.fileObject.create({
    data: {
      id,
      agencyId: input.agencyId,
      store: 'db',
      filename,
      contentType: 'application/zip',
      sizeBytes: input.bytes.byteLength,
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
      createdById: input.createdById,
    },
  });
  await tx.fileBlob.create({
    data: { agencyId: input.agencyId, fileId: id, bytes: new Uint8Array(input.bytes) },
  });
  return id;
}

/** Removes exports beyond the newest few, with their files. */
async function pruneExports(
  tx: ScopedTx,
  store: ObjectStore | null,
  keep: number,
): Promise<number> {
  const done = await tx.tenantExport.findMany({
    where: { status: 'completed' },
    orderBy: { createdAt: 'desc' },
    skip: keep,
  });
  for (const old of done) {
    if (old.fileId) {
      const file = await tx.fileObject.findUnique({ where: { id: old.fileId } });
      if (file?.store === 's3' && file.externalRef) await store?.delete(file.externalRef);
      await tx.fileBlob.deleteMany({ where: { fileId: old.fileId } });
      await tx.fileObject.deleteMany({ where: { id: old.fileId } });
    }
    await tx.tenantExport.delete({ where: { id: old.id } });
  }
  return done.length;
}

/** Worker job `documents:tenant.export`. Marks the row failed (and says why) rather than retrying a huge build. */
export async function runTenantExportJob(
  ctx: JobContext,
  overrides: { store?: ObjectStore | null; now?: Date } = {},
): Promise<void> {
  const { exportId } = ctx.data as { exportId: string };
  if (!ctx.agencyId) throw new Error('A tenant export needs an agency');
  const agencyId = ctx.agencyId;
  const row = await ctx.withAgency((tx) => tx.tenantExport.findUnique({ where: { id: exportId } }));
  if (!row || row.status === 'completed') return;
  const now = overrides.now ?? new Date();
  const store = overrides.store === undefined ? configuredStore() : overrides.store;
  await ctx.withAgency((tx) =>
    tx.tenantExport.update({ where: { id: exportId }, data: { status: 'running' } }),
  );
  try {
    const slug = await ctx.withAgency(
      async (tx) => (await tx.agency.findUnique({ where: { id: agencyId } }))?.slug ?? 'agency',
    );
    const built = await buildTenantZip((fn) => ctx.withAgency(fn), { agencyId, store, now });
    await ctx.withAgency(async (tx) => {
      const fileId = await storeZip(tx, store, {
        agencyId,
        slug,
        bytes: built.zip,
        createdById: row.requestedById,
        now,
      });
      await tx.tenantExport.update({
        where: { id: exportId },
        data: {
          status: 'completed',
          fileId,
          sizeBytes: built.zip.byteLength,
          tableCounts: built.tableCounts,
          completedAt: new Date(),
        },
      });
      await pruneExports(tx, store, TENANT_EXPORTS_KEPT);
      await tx.activityLog.create({
        data: {
          agencyId,
          actorType: 'system',
          actorId: null,
          action: 'tenant.export_completed',
          entityType: 'tenant_export',
          entityId: exportId,
          data: { bytes: built.zip.byteLength, missingFiles: built.missingFiles.length },
        },
      });
    });
    await ctx.progress({ bytes: built.zip.byteLength, missingFiles: built.missingFiles.length });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'export_failed';
    await ctx.withAgency((tx) =>
      tx.tenantExport.update({
        where: { id: exportId },
        data: { status: 'failed', error: code, completedAt: new Date() },
      }),
    );
    throw error;
  }
}

function configuredStore(): ObjectStore | null {
  try {
    return getObjectStore();
  } catch {
    return null; // S3 not configured: generated files are kept in the database (development)
  }
}
