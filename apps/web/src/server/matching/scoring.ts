// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  computeOverall,
  matchingWeightsSchema,
  type CriterionOverride,
  type CriterionScores,
  type MatchingWeights,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';

/** Reads the stored criterion overrides, tolerating a row that has none. */
export function parseOverrides(raw: unknown): CriterionOverride[] {
  return Array.isArray(raw) ? (raw as CriterionOverride[]) : [];
}

/**
 * The overall score of a stored analysis: from its criterion scores, the weights, and the
 * recruiter's criterion overrides (ADR-007). Pure, no AI.
 */
export function overallFor(
  weights: unknown,
  criterionScores: unknown,
  criterionOverrides: unknown,
): number {
  return computeOverall(
    matchingWeightsSchema.parse(weights),
    criterionScores as CriterionScores,
    parseOverrides(criterionOverrides),
  );
}

/**
 * Applies new position weights to every analysis of the position and recomputes the overall scores
 * (T-3-04). It does not call AI and does not mark anything stale: only a new approved profile does.
 * Returns how many analyses changed.
 */
export async function recomputePositionScores(
  tx: ScopedTx,
  positionId: string,
  weights: MatchingWeights,
): Promise<number> {
  const rows = await tx.matchAnalysis.findMany({
    where: { entry: { positionId } },
    select: { id: true, criterionScores: true, criterionOverrides: true, overallScore: true },
  });
  let changed = 0;
  for (const row of rows) {
    const overallScore = overallFor(weights, row.criterionScores, row.criterionOverrides);
    await tx.matchAnalysis.update({ where: { id: row.id }, data: { weights, overallScore } });
    if (overallScore !== row.overallScore) changed++;
  }
  return changed;
}
