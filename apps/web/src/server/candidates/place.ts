// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { readApproved } from '@/server/artifacts/service';
import { startBatchAnalysis } from '@/server/matching/batch';
import { addCandidateToPosition } from '@/server/pipeline/service';
import { requirePosition } from '@/server/positions/service';
import { getCandidate, type CandidateView } from './service';

/**
 * Upload for a position, confirm, analyze (G#9; brief 4.1, 4.2, 5.1, 5.2). When the recruiter
 * confirms a draft that was uploaded for a position, the same click can add the candidate there and
 * ask for the match analysis. Nothing here runs without that click (DP-2), the analysis is a draft
 * like any other (DP-3), and no score moves or hides anyone (FR-MAT-03).
 */
export interface Placement {
  entryId: string;
  /** False when the candidate was already in the position (for example after a merge). */
  added: boolean;
  /** The position has a confirmed success profile, so an analysis can run. */
  canAnalyze: boolean;
}

export type AnalysisRequest =
  | { status: 'queued'; jobRunId: string }
  | { status: 'not_requested' }
  /** The position's success profile is not confirmed yet (FR-INT-11), so there is nothing to compare with. */
  | { status: 'needs_success_profile' }
  /** The candidate is in the position under another recruiter, who owns the analysis. */
  | { status: 'not_allowed' }
  | { status: 'failed' };

/** Most drafts the position page lists at once: a few uploads of 10 (POSITION_INTAKE_MAX_FILES). */
const DRAFT_LIST_LIMIT = 50;

export type IntakeDraftState = 'reading' | 'readFailed' | 'drafting' | 'aiFailed' | 'ready';

export interface IntakeDraft {
  candidateId: string;
  filename: string;
  createdAt: Date;
  state: IntakeDraftState;
}

/** Where a draft stands on its way to the recruiter's review. */
export function intakeDraftState(c: CandidateView): IntakeDraftState {
  if (c.documents.some((d) => d.extractionStatus === 'pending')) return 'reading';
  if (c.profileArtifactId) return 'ready';
  if (c.documents.some((d) => d.extractionStatus === 'failed')) return 'readFailed';
  if (c.profileAi?.status === 'failed') return 'aiFailed';
  return 'drafting';
}

/**
 * Drafts uploaded for this position that still wait for the recruiter's review, newest first, so
 * the position page can show them after the upload table is gone (G#9). Confirmed ones are in the
 * pipeline instead; discarded or merged ones are gone.
 */
export async function listIntakeDrafts(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<IntakeDraft[]> {
  await requirePosition(tx, actor, positionId, 'read');
  const rows = await tx.candidate.findMany({
    where: { intakePositionId: positionId, status: 'draft', mergedIntoId: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: DRAFT_LIST_LIMIT,
    select: { id: true },
  });
  const drafts: IntakeDraft[] = [];
  for (const row of rows) {
    const c = await getCandidate(tx, row.id);
    drafts.push({
      candidateId: c.id,
      filename: c.documents.at(-1)?.filename ?? c.fullName,
      createdAt: c.createdAt,
      state: intakeDraftState(c),
    });
  }
  return drafts;
}

/** Adds the confirmed candidate to the position, or finds the entry that is already there. */
export async function placeConfirmedCandidate(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  positionId: string,
): Promise<Placement> {
  const position = await requirePosition(tx, actor, positionId, 'read');
  if (position.status === 'filled' || position.status === 'cancelled') {
    // Its own code, so the review page can say so instead of "no profile to confirm" (also a 409).
    throw new ApiError('position_closed', 'This position is closed', { status: 409 });
  }
  const existing = await tx.pipelineEntry.findUnique({
    where: { positionId_candidateId: { positionId, candidateId } },
    select: { id: true },
  });
  const entryId = existing
    ? existing.id
    : (await addCandidateToPosition(tx, actor, positionId, { candidateId })).id;
  const successProfile = await readApproved(tx, {
    kind: 'success_profile',
    subject: { type: 'position', id: positionId },
  });
  return { entryId, added: !existing, canAnalyze: Boolean(successProfile) };
}

/**
 * Queues the analysis of one placed candidate. Runs after the confirmation is saved: the candidate
 * stays confirmed and in the position even when the analysis cannot start, and the answer says why.
 */
export async function requestPlacementAnalysis(
  actor: AgencyActor,
  positionId: string,
  placement: Placement,
): Promise<AnalysisRequest> {
  if (!placement.canAnalyze) return { status: 'needs_success_profile' };
  try {
    const { jobRunId } = await startBatchAnalysis(actor, positionId, {
      entryIds: [placement.entryId],
    });
    return { status: 'queued', jobRunId };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return { status: 'not_allowed' };
    return { status: 'failed' };
  }
}
