// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, ConfirmCandidateInput } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { planMatchAnalysis } from '@/server/matching/analyze';
import {
  addCandidateToPosition,
  getEntryForCandidate,
  type PipelineEntryView,
} from '@/server/pipeline/service';
import { requirePosition } from '@/server/positions/service';
import { confirmCandidate, type ConfirmResult } from './confirm';

/** Why the analysis was not offered, in words the recruiter can act on. */
export interface AnalysisReadiness {
  ready: boolean;
  reason: string | null;
}

export interface ConfirmAndAddResult extends ConfirmResult {
  entry: PipelineEntryView;
  /** True when the surviving candidate was already in this position (a merge into someone in the pipeline). */
  alreadyInPosition: boolean;
  /** Whether the recruiter can now start the match analysis. Nothing has been analyzed yet. */
  analysis: AnalysisReadiness;
}

/**
 * Confirms a pasted profile, adds the person to the position and says whether the match analysis
 * can start (brief 4.2, 5.1). The recruiter's click on this action is the request for the analysis
 * (FR-AI-01), but the model is not called here: the caller starts the existing streamed analysis for
 * the returned entry. Duplicate resolution is the same as for any confirm (409 `possible_duplicate`
 * until the recruiter chooses). After a merge the existing candidate's approved profile has not
 * changed (the pasted one is a new draft to review), so no analysis is offered on stale facts.
 */
export async function confirmAddAndPlan(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  input: ConfirmCandidateInput,
): Promise<ConfirmAndAddResult> {
  await requirePosition(tx, actor, positionId, 'read');
  const confirmed = await confirmCandidate(tx, actor, input);

  const existing = await getEntryForCandidate(tx, actor, positionId, confirmed.candidateId);
  const entry =
    existing ??
    (await addCandidateToPosition(tx, actor, positionId, { candidateId: confirmed.candidateId }));

  const analysis = await readiness(tx, actor, entry.id, confirmed.mergedIntoId !== null);
  return { ...confirmed, entry, alreadyInPosition: existing !== null, analysis };
}

async function readiness(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  merged: boolean,
): Promise<AnalysisReadiness> {
  if (merged) {
    return {
      ready: false,
      reason:
        'The pasted profile was merged into an existing candidate. Review and confirm the updated profile, then run the analysis.',
    };
  }
  try {
    await planMatchAnalysis(tx, actor, entryId);
    return { ready: true, reason: null };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { ready: false, reason: e.message };
    throw e;
  }
}
