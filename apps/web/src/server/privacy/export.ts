// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import type { ObjectStore } from '@/server/files/object-store';
import { sanitizeFilename } from '@/server/documents/store';
import { collectCandidateScope } from './scope';

/** Everything the agency holds about one candidate, as plain data (T-0-04, FR-PLT-08, US-008). */
export async function collectCandidateData(tx: ScopedTx, candidateId: string) {
  const candidate = await tx.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw notFound('Candidate');
  const scope = await collectCandidateScope(tx, candidateId);
  const entryIds = scope.entryIds;
  const inEntries = { in: entryIds };
  const versions = await tx.artifactVersion.findMany({
    where: { artifactId: { in: scope.artifactIds } },
    orderBy: [{ artifactId: 'asc' }, { version: 'asc' }],
  });
  return {
    candidate,
    documents: await tx.candidateDocument.findMany({ where: { candidateId } }),
    pipelineEntries: await tx.pipelineEntry.findMany({ where: { candidateId } }),
    pipelineTransitions: await tx.pipelineTransition.findMany({ where: { entryId: inEntries } }),
    artifacts: await tx.artifact.findMany({ where: { id: { in: scope.artifactIds } } }),
    artifactVersions: versions,
    matchAnalyses: await tx.matchAnalysis.findMany({ where: { entryId: inEntries } }),
    screening: await tx.screeningAssessment.findMany({ where: { entryId: inEntries } }),
    qualifications: await tx.qualificationRecord.findMany({ where: { entryId: inEntries } }),
    outreachTouches: await tx.outreachTouch.findMany({ where: { entryId: inEntries } }),
    outbox: await tx.outboxMessage.findMany({
      where: { entityType: 'pipeline_entry', entityId: inEntries },
      select: {
        id: true,
        toAddress: true,
        subject: true,
        bodyText: true,
        status: true,
        sentAt: true,
        createdAt: true,
      },
    }),
    tailoredResumes: await tx.tailoredResume.findMany({ where: { entryId: inEntries } }),
    submissionReports: await tx.submissionReport.findMany({ where: { entryId: inEntries } }),
    submissions: await tx.submission.findMany({ where: { entryId: inEntries } }),
    interviews: await tx.interview.findMany({
      where: { entryId: inEntries },
      include: { feedback: true },
    }),
    offers: await tx.offer.findMany({ where: { entryId: inEntries } }),
    approvals: await tx.approval.findMany({
      where: { subjectId: inEntries, subject: 'tailored_resume' },
    }),
    notes: await tx.candidateNote.findMany({ where: { candidateId } }),
    consents: await tx.consent.findMany({ where: { candidateId } }),
    privacyRequests: await tx.privacyRequest.findMany({ where: { candidateId } }),
    activity: await tx.activityLog.findMany({
      where: { entityId: { in: [candidateId, ...entryIds] } },
      orderBy: { createdAt: 'asc' },
    }),
    fileIds: scope.fileIds,
  };
}

export interface ExportFileSource {
  /** Bytes of a stored file, from the database or object storage. */
  read(fileId: string): Promise<{ filename: string; bytes: Uint8Array } | null>;
}

/**
 * Builds the ZIP: `candidate.json` with every row, and `files/` with the originals and generated
 * documents. A file that can no longer be read is listed in `missing-files.txt` instead of failing
 * the whole export.
 */
export async function buildCandidateZip(
  data: Awaited<ReturnType<typeof collectCandidateData>>,
  files: ExportFileSource,
  now: Date,
): Promise<Buffer> {
  const zip = new JSZip();
  const { fileIds, ...rows } = data;
  zip.file('candidate.json', JSON.stringify({ exportedAt: now.toISOString(), ...rows }, null, 2));
  const missing: string[] = [];
  const used = new Set<string>();
  for (const id of fileIds) {
    const file = await files.read(id);
    if (!file) {
      missing.push(id);
      continue;
    }
    let name = sanitizeFilename(file.filename);
    if (used.has(name)) name = `${id.slice(0, 8)}-${name}`;
    used.add(name);
    zip.file(`files/${name}`, file.bytes);
  }
  if (missing.length) zip.file('missing-files.txt', missing.join('\n'));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Reads files the way the download route does: originals from Postgres, generated files from object storage. */
export function fileSourceFor(tx: ScopedTx, store: ObjectStore | null): ExportFileSource {
  return {
    async read(fileId) {
      const file = await tx.fileObject.findUnique({ where: { id: fileId } });
      if (!file) return null;
      if (file.store === 'db') {
        const blob = await tx.fileBlob.findUnique({ where: { fileId } });
        return blob ? { filename: file.filename, bytes: blob.bytes } : null;
      }
      if (file.store === 's3' && file.externalRef && store) {
        const url = await store.presignGet(file.externalRef, {
          ttlSec: 60,
          filename: file.filename,
        });
        const response = await fetch(url);
        return response.ok
          ? { filename: file.filename, bytes: new Uint8Array(await response.arrayBuffer()) }
          : null;
      }
      return null;
    },
  };
}

/** Stores the finished ZIP as a file of the agency, kept in the database whatever its size (it is for one admin download). */
export async function storeExportZip(
  tx: ScopedTx,
  input: { agencyId: string; bytes: Buffer; createdById: string | null; now: Date },
): Promise<{ id: string }> {
  const id = randomUUID();
  const filename = `candidate-export-${input.now.toISOString().slice(0, 10)}.zip`;
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
  return { id };
}
