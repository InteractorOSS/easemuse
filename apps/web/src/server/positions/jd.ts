// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import type { AgencyActor, ExtractionStatus } from '@easemuse/core';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { logActivity } from '@/server/activity/service';
import { storeOriginal } from '@/server/documents/store';
import { requirePosition } from './service';

/**
 * The client's original JD (T-1-05, FR-INT-03): uploaded or pasted, kept unchanged. An upload is
 * stored first and read in the background (`documents:jd.extract`); pasted text needs no reading.
 * Uploading again adds another original; the earlier ones stay.
 */
export interface OriginalJdView {
  id: string;
  fileId: string | null;
  filename: string | null;
  /** The text the rest of the flow works from; null until extraction finishes or if it failed. */
  text: string | null;
  extractionStatus: ExtractionStatus;
  extractionMethod: string | null;
  extractionError: string | null;
  parsedFromImage: boolean;
  createdAt: Date;
}

const select = {
  id: true,
  fileId: true,
  text: true,
  extractionStatus: true,
  extractionMethod: true,
  extractionError: true,
  parsedFromImage: true,
  createdAt: true,
} satisfies Prisma.JobDescriptionSelect;

async function withFilenames(
  tx: ScopedTx,
  rows: Prisma.JobDescriptionGetPayload<{ select: typeof select }>[],
): Promise<OriginalJdView[]> {
  const ids = rows.flatMap((r) => (r.fileId ? [r.fileId] : []));
  const files = ids.length
    ? await tx.fileObject.findMany({
        where: { id: { in: ids } },
        select: { id: true, filename: true },
      })
    : [];
  const names = new Map(files.map((f) => [f.id, f.filename]));
  return rows.map((r) => ({
    ...r,
    filename: r.fileId ? (names.get(r.fileId) ?? null) : null,
    extractionStatus: r.extractionStatus as ExtractionStatus,
  }));
}

export async function listOriginals(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<OriginalJdView[]> {
  await requirePosition(tx, actor, positionId, 'read');
  const rows = await tx.jobDescription.findMany({
    where: { positionId, kind: 'original' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select,
  });
  return withFilenames(tx, rows);
}

export async function addPastedOriginal(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  text: string,
): Promise<OriginalJdView> {
  await requirePosition(tx, actor, positionId, 'edit');
  const row = await tx.jobDescription.create({
    data: {
      agencyId: actor.agencyId,
      positionId,
      kind: 'original',
      text,
      extractionStatus: 'ready',
      extractionMethod: 'pasted',
    },
    select,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.jd_added',
    entityType: 'position',
    entityId: positionId,
    data: { jobDescriptionId: row.id, source: 'pasted' },
  });
  return (await withFilenames(tx, [row]))[0]!;
}

/** Stores the uploaded file and records the original as pending; the caller then starts extraction. */
export async function addUploadedOriginal(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  file: { filename: string; bytes: Uint8Array },
): Promise<OriginalJdView> {
  await requirePosition(tx, actor, positionId, 'edit');
  const stored = await storeOriginal(tx, {
    agencyId: actor.agencyId,
    filename: file.filename,
    bytes: file.bytes,
    createdById: actor.userId,
  });
  const row = await tx.jobDescription.create({
    data: {
      agencyId: actor.agencyId,
      positionId,
      kind: 'original',
      fileId: stored.id,
      extractionStatus: 'pending',
    },
    select,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.jd_added',
    entityType: 'position',
    entityId: positionId,
    data: { jobDescriptionId: row.id, source: 'upload' },
  });
  return (await withFilenames(tx, [row]))[0]!;
}

/** Queues text extraction for an uploaded original. If the queue is down the original is marked failed, not left pending forever. */
export async function startExtraction(
  actor: AgencyActor,
  jobDescriptionId: string,
): Promise<string | null> {
  try {
    const { jobRunId } = await enqueue({
      queue: 'documents',
      name: 'jd.extract',
      agencyId: actor.agencyId,
      requestedById: actor.userId,
      data: { jobDescriptionId },
      idempotencyKey: `jd.extract:${jobDescriptionId}`,
    });
    return jobRunId;
  } catch {
    await withAgency(actor.agencyId, (tx) =>
      tx.jobDescription.update({
        where: { id: jobDescriptionId },
        data: {
          extractionStatus: 'failed',
          extractionError: 'Could not start reading the file. Try uploading again.',
        },
      }),
    );
    throw new ApiError('internal_error', 'Could not start reading the file', { status: 503 });
  }
}
