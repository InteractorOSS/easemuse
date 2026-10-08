// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { emptyCandidateProfile, type AgencyActor, type CandidateStatusValue } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import {
  addDraftVersion,
  findArtifact,
  findOrCreateArtifact,
  getArtifactWithVersions,
} from '@/server/artifacts/service';

/** A candidate for the review and detail pages (T-2-05, T-2-12). */
export interface CandidateView {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  profileUrl: string | null;
  source: string;
  status: CandidateStatusValue;
  currentTitle: string | null;
  location: string | null;
  skills: string[];
  yearsExperience: number | null;
  doNotContact: boolean;
  doNotContactReason: string | null;
  doNotContactAt: Date | null;
  tags: string[];
  createdAt: Date;
  /** The positions this candidate is in (pipeline entries). */
  positions: {
    entryId: string;
    positionId: string;
    title: string;
    clientName: string;
    state: string;
  }[];
  /** The newest profile artifact (draft or approved), if the AI has produced one. */
  profileArtifactId: string | null;
  approvedProfileVersionId: string | null;
  /**
   * The newest AI attempt at the profile (A7), so the review page can say it failed and why instead
   * of waiting forever. Null before the first attempt starts.
   */
  profileAi: {
    status: 'running' | 'succeeded' | 'failed' | 'cancelled';
    error: string | null;
  } | null;
  documents: {
    id: string;
    fileId: string;
    filename: string;
    kind: string;
    extractionStatus: 'pending' | 'ready' | 'failed';
    extractionError: string | null;
    parsedFromImage: boolean;
    createdAt: Date;
  }[];
}

export async function getCandidate(tx: ScopedTx, candidateId: string): Promise<CandidateView> {
  const row = await tx.candidate.findUnique({ where: { id: candidateId } });
  if (!row || row.status === 'discarded') throw notFound('Candidate');
  const [documents, artifact, entries, attempt] = await Promise.all([
    tx.candidateDocument.findMany({
      where: { candidateId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    findArtifact(tx, {
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: candidateId },
    }),
    tx.pipelineEntry.findMany({
      where: { candidateId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        state: true,
        position: { select: { id: true, title: true, client: { select: { name: true } } } },
      },
    }),
    tx.aiGeneration.findFirst({
      where: {
        purpose: 'profile.structure',
        inputRefs: { path: ['candidateId'], equals: candidateId },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { status: true, error: true },
    }),
  ]);
  const files = documents.length
    ? await tx.fileObject.findMany({
        where: { id: { in: documents.map((d) => d.fileId) } },
        select: { id: true, filename: true },
      })
    : [];
  const names = new Map(files.map((f) => [f.id, f.filename]));
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    profileUrl: row.profileUrl,
    source: row.source,
    status: row.status,
    currentTitle: row.currentTitle,
    location: row.location,
    skills: row.skills,
    yearsExperience: row.yearsExperience,
    doNotContact: row.doNotContact,
    doNotContactReason: row.doNotContactReason,
    doNotContactAt: row.doNotContactAt,
    tags: row.tags,
    createdAt: row.createdAt,
    positions: entries.map((e) => ({
      entryId: e.id,
      positionId: e.position.id,
      title: e.position.title,
      clientName: e.position.client.name,
      state: e.state,
    })),
    profileArtifactId: artifact?.id ?? null,
    approvedProfileVersionId: artifact?.approvedVersionId ?? null,
    profileAi: attempt
      ? {
          status: attempt.status as NonNullable<CandidateView['profileAi']>['status'],
          error: attempt.error,
        }
      : null,
    documents: documents.map((d) => ({
      id: d.id,
      fileId: d.fileId,
      filename: names.get(d.fileId) ?? '',
      kind: d.kind,
      extractionStatus: d.extractionStatus as 'pending' | 'ready' | 'failed',
      extractionError: d.extractionError,
      parsedFromImage: d.parsedFromImage,
      createdAt: d.createdAt,
    })),
  };
}

/** Throws the draft away before it was confirmed. The stored originals stay (FR-PLT-05). */
export async function discardDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
): Promise<void> {
  const row = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { status: true },
  });
  if (!row) throw notFound('Candidate');
  if (row.status !== 'draft') {
    throw new ApiError('conflict', 'Only a draft candidate can be discarded', { status: 409 });
  }
  await tx.candidate.update({ where: { id: candidateId }, data: { status: 'discarded' } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.draft_discarded',
    entityType: 'candidate',
    entityId: candidateId,
  });
}

/**
 * Lets the recruiter type the profile instead of waiting for the AI (FR-SRC-02, NFR-R03): a blank
 * draft written by a person, edited in the usual profile editor and confirmed the usual way. When a
 * profile draft already exists (from the AI or an earlier click), it is kept and returned.
 */
export async function startManualProfile(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
): Promise<{ artifactId: string; created: boolean }> {
  const row = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { status: true },
  });
  if (!row || row.status === 'discarded') throw notFound('Candidate');
  if (row.status !== 'draft') {
    throw new ApiError('conflict', 'This candidate is already confirmed', { status: 409 });
  }
  const subject = { type: 'candidate' as const, id: candidateId };
  const existing = await findArtifact(tx, { kind: 'candidate_profile', subject });
  if (existing) {
    const withVersions = await getArtifactWithVersions(tx, existing.id);
    if ((withVersions?.versions.length ?? 0) > 0)
      return { artifactId: existing.id, created: false };
  }
  const artifact =
    existing ??
    (await findOrCreateArtifact(tx, {
      agencyId: actor.agencyId,
      kind: 'candidate_profile',
      subject,
    }));
  await addDraftVersion(tx, {
    agencyId: actor.agencyId,
    artifactId: artifact.id,
    content: emptyCandidateProfile(),
    origin: 'human',
    createdById: actor.userId,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.profile_started_by_hand',
    entityType: 'candidate',
    entityId: candidateId,
  });
  return { artifactId: artifact.id, created: true };
}
