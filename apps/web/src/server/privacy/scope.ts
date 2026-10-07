// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';

export interface CandidateScope {
  entryIds: string[];
  /** Artifacts about the candidate or about the candidate in a position (profile, resume, report, outreach...). */
  artifactIds: string[];
  /** Files that belong to this candidate only: originals not shared with another candidate, and generated documents. */
  fileIds: string[];
}

/**
 * Finds everything that belongs to one candidate, for the export and the deletion alike, so both
 * always cover the same set (ADR-016).
 */
export async function collectCandidateScope(
  tx: ScopedTx,
  candidateId: string,
): Promise<CandidateScope> {
  const entries = await tx.pipelineEntry.findMany({ where: { candidateId }, select: { id: true } });
  const entryIds = entries.map((e) => e.id);
  const artifacts = await tx.artifact.findMany({
    where: {
      OR: [
        { subjectType: 'candidate', subjectId: candidateId },
        { subjectType: 'pipeline_entry', subjectId: { in: entryIds } },
      ],
    },
    select: { id: true },
  });
  const artifactIds = artifacts.map((a) => a.id);
  const versionIds = (
    await tx.artifactVersion.findMany({
      where: { artifactId: { in: artifactIds } },
      select: { id: true },
    })
  ).map((v) => v.id);

  const documents = await tx.candidateDocument.findMany({
    where: { candidateId },
    select: { fileId: true },
  });
  // An identical upload is stored once per agency, so another candidate may point at the same file.
  const shared = new Set(
    (
      await tx.candidateDocument.findMany({
        where: {
          candidateId: { not: candidateId },
          fileId: { in: documents.map((d) => d.fileId) },
        },
        select: { fileId: true },
      })
    ).map((d) => d.fileId),
  );
  const ids = new Set<string>(documents.map((d) => d.fileId).filter((id) => !shared.has(id)));
  const add = (id: string | null | undefined) => {
    if (id) ids.add(id);
  };
  for (const r of await tx.tailoredResume.findMany({ where: { entryId: { in: entryIds } } })) {
    add(r.pdfFileId);
    add(r.docxFileId);
  }
  for (const r of await tx.submissionReport.findMany({ where: { entryId: { in: entryIds } } }))
    add(r.pdfFileId);
  for (const s of await tx.submission.findMany({ where: { entryId: { in: entryIds } } })) {
    add(s.reportPdfFileId);
    add(s.resumeFileId);
  }
  for (const d of await tx.renderedDocument.findMany({ where: { versionId: { in: versionIds } } }))
    add(d.fileId);
  return { entryIds, artifactIds, fileIds: [...ids] };
}
