// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import type { ObjectStore } from '@/server/files/object-store';
import { collectCandidateScope } from './scope';

export const DELETED_NAME = 'Deleted candidate';

/** The object-storage keys of the files that will be removed, read before the database rows go. */
export async function s3KeysOf(tx: ScopedTx, fileIds: string[]): Promise<string[]> {
  const files = await tx.fileObject.findMany({
    where: { id: { in: fileIds }, store: 's3' },
    select: { externalRef: true },
  });
  return files.flatMap((f) => (f.externalRef ? [f.externalRef] : []));
}

/** Deletes generated files from object storage. A failure is returned, not thrown: the rows can still go. */
export async function deleteObjects(store: ObjectStore | null, keys: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const key of keys) {
    try {
      await store?.delete(key);
    } catch {
      failed.push(key);
    }
    if (!store) failed.push(key);
  }
  return failed;
}

export interface AnonymizeResult {
  filesRemoved: number;
  artifactsRemoved: number;
}

/**
 * Removes a candidate's personal data (T-0-05, ADR-016, US-008), inside ONE transaction run as the
 * data-rights role:
 *  1. files: stored originals and generated documents (not an original another candidate also uses);
 *  2. artifacts about the candidate and their pipeline entries, with every version, render,
 *     match analysis and embedding;
 *  3. the candidate row: name, contact and profile fields are replaced or emptied;
 *  4. personal data inside audit rows is redacted (activity details, approver names, free-text
 *     reasons, messages sent to the candidate), while the rows themselves stay.
 * Pipeline transitions and the aggregate fields (source, stages, dates) are kept, so KPIs stay right.
 * Running it again changes nothing.
 */
export async function anonymizeCandidate(
  tx: ScopedTx,
  candidateId: string,
  now: Date = new Date(),
): Promise<AnonymizeResult> {
  const candidate = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, agencyId: true, email: true },
  });
  if (!candidate) throw notFound('Candidate');
  const scope = await collectCandidateScope(tx, candidateId);
  const { entryIds, artifactIds, fileIds } = scope;

  // 2. artifacts and what hangs off them
  const versionIds = (
    await tx.artifactVersion.findMany({
      where: { artifactId: { in: artifactIds } },
      select: { id: true },
    })
  ).map((v) => v.id);
  await tx.renderedDocument.deleteMany({ where: { versionId: { in: versionIds } } });
  await tx.profileEmbedding.deleteMany({ where: { subjectId: candidateId } });
  await tx.matchAnalysis.deleteMany({ where: { entryId: { in: entryIds } } });
  await tx.artifactVersion.deleteMany({ where: { artifactId: { in: artifactIds } } });
  await tx.artifact.deleteMany({ where: { id: { in: artifactIds } } });
  await tx.candidateDocument.deleteMany({ where: { candidateId } });
  await tx.portalUser.deleteMany({ where: { candidateId } });
  // What the candidate told us about themselves in the portal is personal data (FR-CDP-04).
  await tx.candidateUpdateProposal.deleteMany({ where: { candidateId } });

  // 1. files
  await tx.fileBlob.deleteMany({ where: { fileId: { in: fileIds } } });
  await tx.fileObject.deleteMany({ where: { id: { in: fileIds } } });

  // 3. the candidate row
  await tx.candidate.update({
    where: { id: candidateId },
    data: {
      fullName: DELETED_NAME,
      email: null,
      phone: null,
      profileUrl: null,
      tags: [],
      currentTitle: null,
      location: null,
      seniority: null,
      skills: [],
      yearsExperience: null,
      availability: null,
      phoneKey: null,
      profileKey: null,
      employerKeys: [],
      doNotContactReason: null,
      profileArtifactId: null,
      status: 'discarded',
      anonymizedAt: now,
    },
  });
  await tx.$executeRaw`UPDATE "Candidate" SET "searchText" = NULL WHERE id = ${candidateId}::uuid`;

  // 4. audit rows keep their shape; personal content goes
  const about = [candidateId, ...entryIds];
  await tx.activityLog.updateMany({
    where: { entityId: { in: about } },
    data: { data: { redacted: true } },
  });
  await tx.pipelineTransition.updateMany({
    where: { entryId: { in: entryIds } },
    data: { reason: null },
  });
  await tx.approval.updateMany({
    where: { subject: 'tailored_resume', subjectId: { in: entryIds } },
    data: { approverName: 'Deleted', comments: null },
  });
  await tx.interviewFeedback.updateMany({
    where: { interview: { entryId: { in: entryIds } } },
    data: { comments: null },
  });
  await tx.outboxMessage.updateMany({
    where: { entityType: 'pipeline_entry', entityId: { in: entryIds } },
    data: { toAddress: 'deleted', subject: '', bodyText: '', bodyHtml: '' },
  });
  await tx.proposedTransition.updateMany({
    where: { entryId: { in: entryIds } },
    data: { reason: null },
  });
  await tx.task.updateMany({
    where: { entityId: { in: about }, completedAt: null },
    data: { completedAt: now },
  });
  return { filesRemoved: fileIds.length, artifactsRemoved: artifactIds.length };
}
