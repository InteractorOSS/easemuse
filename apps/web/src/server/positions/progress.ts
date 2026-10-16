// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, PipelineState } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { findArtifact, readApproved } from '@/server/artifacts/service';
import { isJdApproved } from './jd-approval';
import { requirePosition } from './service';

/**
 * Where a position stands in the hiring process (G#10; brief 2, 3, 4, 5.3), for the position page's
 * process bar and "next" card. Read-only counts and states: nothing here runs AI or moves anyone.
 */
export interface PositionProgress {
  /** none: no structured JD yet; in_progress: structured, not yet approved by the hiring manager. */
  jd: 'none' | 'in_progress' | 'approved';
  /** none: not written; draft: written, not confirmed; confirmed: the version matching uses (FR-INT-11). */
  successProfile: 'none' | 'draft' | 'confirmed';
  /** Resumes uploaded for this position that still wait for the recruiter's review (G#9). */
  pendingDrafts: number;
  counts: {
    pipeline: number;
    analyzed: number;
    contacted: number;
    interested: number;
    submitted: number;
  };
}

/** States reached only after the first contact. Rejections and closures earlier on are not counted. */
const CONTACTED: readonly PipelineState[] = [
  'contacting',
  'no_response',
  'not_interested',
  'interested',
  'qualified',
  'resume_ready',
  'candidate_approved',
  'submitted',
  'client_rejected',
  'interviewing',
  'offer',
  'declined',
  'accepted',
  'reneged',
  'started',
];
const INTERESTED: readonly PipelineState[] = [
  'interested',
  'qualified',
  'resume_ready',
  'candidate_approved',
];
const SUBMITTED: readonly PipelineState[] = [
  'submitted',
  'client_rejected',
  'interviewing',
  'offer',
  'declined',
  'accepted',
  'reneged',
  'started',
];

export async function getPositionProgress(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<PositionProgress> {
  await requirePosition(tx, actor, positionId, 'read');
  const subject = { type: 'position' as const, id: positionId };
  const [jdArtifact, jdApproved, profileArtifact, profileApproved, entries, analyzed, drafts] =
    await Promise.all([
      findArtifact(tx, { kind: 'structured_jd', subject }),
      isJdApproved(tx, positionId),
      findArtifact(tx, { kind: 'success_profile', subject }),
      readApproved(tx, { kind: 'success_profile', subject }),
      tx.pipelineEntry.findMany({ where: { positionId }, select: { state: true } }),
      tx.matchAnalysis.findMany({
        where: { entry: { positionId } },
        distinct: ['entryId'],
        select: { entryId: true },
      }),
      tx.candidate.count({
        where: { intakePositionId: positionId, status: 'draft', mergedIntoId: null },
      }),
    ]);
  const inStates = (states: readonly PipelineState[]) =>
    entries.filter((e) => states.includes(e.state as PipelineState)).length;
  return {
    jd: jdApproved ? 'approved' : jdArtifact ? 'in_progress' : 'none',
    successProfile: profileApproved ? 'confirmed' : profileArtifact ? 'draft' : 'none',
    pendingDrafts: drafts,
    counts: {
      pipeline: entries.length,
      analyzed: analyzed.length,
      contacted: inStates(CONTACTED),
      interested: inStates(INTERESTED),
      submitted: inStates(SUBMITTED),
    },
  };
}
