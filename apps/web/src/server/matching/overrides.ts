// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  type AgencyActor,
  type CriterionOverride,
  type CriterionScores,
  type MatchOverrideInput,
  type RecruiterAssessmentInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { requireEntry } from '@/server/pipeline/service';
import { overallFor, parseOverrides } from './scoring';

/** The read model of one analysis, with everything the recruiter changed (T-3-06). */
export interface AnalysisView {
  id: string;
  entryId: string;
  artifactId: string;
  versionId: string | null;
  profileVersionId: string;
  successProfileVersionId: string;
  weights: unknown;
  criterionScores: CriterionScores;
  /** Computed in code from the criterion scores and weights, with criterion overrides counted. */
  overallScore: number;
  overrideScore: number | null;
  overrideReason: string | null;
  criterionOverrides: CriterionOverride[];
  recruiterAssessment: string | null;
  stale: boolean;
  createdAt: Date;
}

const toView = (row: Prisma.MatchAnalysisGetPayload<object>): AnalysisView => ({
  id: row.id,
  entryId: row.entryId,
  artifactId: row.artifactId,
  versionId: row.versionId,
  profileVersionId: row.profileVersionId,
  successProfileVersionId: row.successProfileVersionId,
  weights: row.weights,
  criterionScores: row.criterionScores as unknown as CriterionScores,
  overallScore: row.overallScore,
  overrideScore: row.overrideScore,
  overrideReason: row.overrideReason,
  criterionOverrides: parseOverrides(row.criterionOverrides),
  recruiterAssessment: row.recruiterAssessment,
  stale: row.stale,
  createdAt: row.createdAt,
});

/** The analysis for the person to work on: loaded through its entry, so the position visibility and ownership rules apply. */
async function loadEditable(tx: ScopedTx, actor: AgencyActor, analysisId: string) {
  const row = await tx.matchAnalysis.findUnique({ where: { id: analysisId } });
  if (!row) throw notFound('Analysis');
  const entry = await requireEntry(tx, actor, row.entryId, 'edit');
  return { row, entry };
}

async function logChange(
  tx: ScopedTx,
  actor: AgencyActor,
  entry: { candidateId: string; positionId: string; id: string },
  action: string,
  data: Record<string, unknown>,
) {
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action,
      entityType: type,
      entityId: id,
      data: { entryId: entry.id, ...data },
    });
  }
}

/** The newest analysis of a candidate in a position, if any run has finished. Anyone who can see the position. */
export async function getLatestAnalysis(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<AnalysisView | null> {
  await requireEntry(tx, actor, entryId, 'read');
  const row = await tx.matchAnalysis.findFirst({
    where: { entryId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return row ? toView(row) : null;
}

/**
 * Changes the overall score or one criterion's score, with a reason (FR-MAT-04). The computed value
 * is never lost: an overall override sits beside `overallScore`, and a criterion override keeps its
 * `original`. A criterion override changes the computed overall (it is recomputed with the override
 * counted); an overall override replaces it on the dashboard. Every change is on the timeline.
 */
export async function overrideScore(
  tx: ScopedTx,
  actor: AgencyActor,
  analysisId: string,
  input: MatchOverrideInput,
  now: Date = new Date(),
): Promise<AnalysisView> {
  const { row, entry } = await loadEditable(tx, actor, analysisId);

  if (input.kind === 'overall') {
    if (input.score === null && row.overrideScore === null) {
      throw new ApiError('conflict', 'There is no override to remove', { status: 409 });
    }
    const updated = await tx.matchAnalysis.update({
      where: { id: analysisId },
      data:
        input.score === null
          ? { overrideScore: null, overrideReason: null }
          : { overrideScore: input.score, overrideReason: input.reason },
    });
    await logChange(
      tx,
      actor,
      entry,
      input.score === null ? 'match.override_removed' : 'match.overridden',
      {
        analysisId,
        scope: 'overall',
        computed: row.overallScore,
        from: row.overrideScore,
        to: input.score,
        reason: input.reason,
      },
    );
    return toView(updated);
  }

  const scores = row.criterionScores as unknown as CriterionScores;
  const computed = scores[input.key];
  if (!computed)
    throw new ApiError('invalid_input', 'Unknown criterion', {
      status: 422,
      fields: { key: 'Unknown criterion' },
    });
  const existing = parseOverrides(row.criterionOverrides);
  const current = existing.find((o) => o.key === input.key);
  let next: CriterionOverride[];
  if (input.score === null) {
    if (!current) throw new ApiError('conflict', 'There is no override to remove', { status: 409 });
    next = existing.filter((o) => o.key !== input.key);
  } else {
    if (input.score === computed.score && !current) {
      throw new ApiError('invalid_input', 'That is already the computed score', {
        status: 422,
        fields: { score: 'Same as the computed score' },
      });
    }
    const entryFor: CriterionOverride = {
      key: input.key,
      original: computed.score,
      score: input.score,
      reason: input.reason,
      byId: actor.userId,
      at: now.toISOString(),
    };
    next = [...existing.filter((o) => o.key !== input.key), entryFor];
  }
  const updated = await tx.matchAnalysis.update({
    where: { id: analysisId },
    data: {
      criterionOverrides: next as unknown as Prisma.InputJsonValue,
      overallScore: overallFor(row.weights, row.criterionScores, next),
    },
  });
  await logChange(
    tx,
    actor,
    entry,
    input.score === null ? 'match.override_removed' : 'match.overridden',
    {
      analysisId,
      scope: 'criterion',
      key: input.key,
      computed: computed.score,
      from: current?.score ?? null,
      to: input.score,
      reason: input.reason,
    },
  );
  return toView(updated);
}

/**
 * Saves the recruiter's own assessment of the match (FR-MAT-05, brief 5.2). It is a person's text:
 * nothing in the AI path writes it. Empty text clears it.
 */
export async function saveAssessment(
  tx: ScopedTx,
  actor: AgencyActor,
  analysisId: string,
  input: RecruiterAssessmentInput,
): Promise<AnalysisView> {
  const { row, entry } = await loadEditable(tx, actor, analysisId);
  const text = input.text === '' ? null : input.text;
  if (text === row.recruiterAssessment) return toView(row);
  const updated = await tx.matchAnalysis.update({
    where: { id: analysisId },
    data: { recruiterAssessment: text },
  });
  await logChange(tx, actor, entry, 'match.assessment_saved', {
    analysisId,
    cleared: text === null,
  });
  return toView(updated);
}
