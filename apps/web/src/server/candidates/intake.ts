// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import type { AgencyActor, CandidateIntake } from '@easemuse/core';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { logActivity } from '@/server/activity/service';
import { storeOriginal } from '@/server/documents/store';

/**
 * Candidate intake (T-2-02, US-202): a resume file or pasted profile text becomes a DRAFT candidate
 * with its original stored unchanged. The text is read in the background; AI then proposes a profile
 * (T-2-03) and nothing is active until the recruiter confirms. Uploading is the recruiter's request
 * for that AI step (FR-AI-01).
 */
export interface IntakeResult {
  candidateId: string;
  documentId: string;
}

export interface IntakeFile {
  filename: string;
  bytes: Uint8Array;
  /** Pasted text is stored as a text file, so it is an original like any other. */
  kind: 'resume' | 'profile_text';
}

/** Placeholder until the profile is read: the real name comes from the confirmed profile. */
const draftName = (filename: string) =>
  `Draft: ${filename.replace(/\.[^.]+$/, '').slice(0, 80) || 'candidate'}`;

export async function createCandidateDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  intake: CandidateIntake,
  file: IntakeFile,
): Promise<IntakeResult> {
  const stored = await storeOriginal(tx, {
    agencyId: actor.agencyId,
    filename: file.filename,
    bytes: file.bytes,
    createdById: actor.userId,
  });
  const candidate = await tx.candidate.create({
    data: {
      agencyId: actor.agencyId,
      fullName: draftName(file.filename),
      source: intake.source,
      profileUrl: intake.profileUrl ?? null,
      status: 'draft',
      createdById: actor.userId,
    },
    select: { id: true },
  });
  const document = await tx.candidateDocument.create({
    data: {
      agencyId: actor.agencyId,
      candidateId: candidate.id,
      fileId: stored.id,
      kind: file.kind,
      extractionStatus: 'pending',
    } satisfies Prisma.CandidateDocumentUncheckedCreateInput,
    select: { id: true },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.draft_created',
    entityType: 'candidate',
    entityId: candidate.id,
    data: { source: intake.source, kind: file.kind, documentId: document.id },
  });
  return { candidateId: candidate.id, documentId: document.id };
}

/** Queues reading the stored original. If the queue is down the document is marked failed, not left pending. */
export async function startCandidateExtraction(
  actor: AgencyActor,
  documentId: string,
): Promise<string> {
  try {
    const { jobRunId } = await enqueue({
      queue: 'documents',
      name: 'candidate.extract',
      agencyId: actor.agencyId,
      requestedById: actor.userId,
      data: { documentId },
      idempotencyKey: `candidate.extract:${documentId}`,
    });
    return jobRunId;
  } catch {
    await withAgency(actor.agencyId, (tx) =>
      tx.candidateDocument.update({
        where: { id: documentId },
        data: {
          extractionStatus: 'failed',
          extractionError: 'Could not start reading the file. Try uploading again.',
        },
      }),
    );
    throw new ApiError('internal_error', 'Could not start reading the file', { status: 503 });
  }
}

/**
 * "Structure again": queues a fresh AI profile draft for a candidate (US-202). The recruiter asked,
 * so this is the request FR-AI-01 needs; every request is its own run.
 */
export async function requestProfileStructure(
  actor: AgencyActor,
  candidateId: string,
): Promise<string> {
  await withAgency(
    actor.agencyId,
    async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId },
        select: { status: true },
      });
      if (!candidate || candidate.status === 'discarded') throw notFound('Candidate');
    },
    { userId: actor.userId },
  );
  const { jobRunId } = await enqueue({
    queue: 'ai',
    name: 'profile.structure',
    agencyId: actor.agencyId,
    requestedById: actor.userId,
    data: { candidateId },
    idempotencyKey: `profile.structure:${candidateId}:${crypto.randomUUID()}`,
  });
  return jobRunId;
}
