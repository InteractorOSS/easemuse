// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { evidenceSchema } from '../schemas/evidence';
import { MATCH_WEIGHT_KEYS, type MatchWeightKey, type MatchingWeights } from '../schemas/settings';

/**
 * The match analysis (brief 5, ADR-007): the model judges each of seven criteria with evidence and
 * says whether each must-have and deal-breaker is met. CODE turns the criterion scores into the
 * overall score with the position's weights, so the number is explainable and can be recomputed
 * when the weights change without another AI call.
 */
export const MATCH_LEVELS = ['strong', 'partial', 'gap', 'unknown'] as const;
export type MatchLevel = (typeof MATCH_LEVELS)[number];

/** The score range each level may carry (ADR-007 rubric); "unknown" is neutral so missing facts neither help nor hurt. */
export const LEVEL_BANDS: Record<MatchLevel, { min: number; max: number }> = {
  strong: { min: 85, max: 100 },
  partial: { min: 50, max: 84 },
  gap: { min: 0, max: 49 },
  unknown: { min: 50, max: 50 },
};

/** Brings a score into its level's band, so a level and its number can never disagree. */
export function scoreForLevel(level: MatchLevel, score: number): number {
  const band = LEVEL_BANDS[level];
  return Math.min(
    band.max,
    Math.max(band.min, Math.round(Number.isFinite(score) ? score : band.min)),
  );
}

const criterionShape = {
  key: z.enum(MATCH_WEIGHT_KEYS),
  level: z.enum(MATCH_LEVELS),
  score: z.number().min(0).max(100),
  /** One sentence the dashboard shows as the strength or the gap. */
  summary: z.string().trim().min(1).max(300),
  /** Where it comes from: words from the profile, or a labelled inference. At most three. */
  evidence: z.array(evidenceSchema).max(3),
  /** What to ask the candidate or check. At most three. */
  toConfirm: z.array(z.string().trim().min(1).max(200)).max(3),
};

export const REQUIREMENT_STATUSES = ['met', 'not_met', 'unknown'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

const requirementShape = {
  /** The success-profile criterion this answers. */
  criterionId: z.string().min(1).max(64),
  status: z.enum(REQUIREMENT_STATUSES),
  evidence: z.array(evidenceSchema).max(3),
};

/** What the model returns for A10. */
export const matchAnalysisModelOutputSchema = z.object({
  criteria: z.array(z.object(criterionShape)).length(MATCH_WEIGHT_KEYS.length),
  requirements: z.array(z.object(requirementShape)).max(80),
});
export type MatchAnalysisModelOutput = z.infer<typeof matchAnalysisModelOutputSchema>;

/** The artifact content: criteria in the fixed order, scores brought into their bands. */
export const matchAnalysisContentSchema = matchAnalysisModelOutputSchema;
export type MatchAnalysisContent = z.infer<typeof matchAnalysisContentSchema>;
export type CriterionResult = MatchAnalysisContent['criteria'][number];

/**
 * Puts the model's criteria in the fixed order, one per criterion (a missing or repeated one is an
 * error the model must fix, not something to guess), and brings each score into its level's band.
 */
export function normalizeCriteria(criteria: CriterionResult[]): CriterionResult[] {
  return MATCH_WEIGHT_KEYS.map((key) => {
    const found = criteria.filter((c) => c.key === key);
    if (found.length !== 1)
      throw new Error(`Expected exactly one assessment of ${key}, got ${found.length}`);
    const c = found[0]!;
    return { ...c, score: scoreForLevel(c.level, c.score) };
  });
}

/** A recruiter's change to one criterion's score (FR-MAT-04): both numbers are kept. */
export interface CriterionOverride {
  key: MatchWeightKey;
  original: number;
  score: number;
  reason: string;
  byId: string;
  at: string;
}

export interface CriterionScore {
  level: MatchLevel;
  score: number;
}
export type CriterionScores = Record<MatchWeightKey, CriterionScore>;

export function criterionScoresOf(criteria: CriterionResult[]): CriterionScores {
  return Object.fromEntries(
    criteria.map((c) => [c.key, { level: c.level, score: c.score }]),
  ) as CriterionScores;
}

/** The score used for a criterion: the recruiter's override if there is one, else the computed one. */
export function effectiveScore(
  scores: CriterionScores,
  overrides: CriterionOverride[],
  key: MatchWeightKey,
): number {
  const override = overrides.find((o) => o.key === key);
  return override ? override.score : scores[key].score;
}

/**
 * Overall = sum(weight x score) / 100, rounded to a whole number (ADR-007). The weights must add up
 * to 100; the score of every criterion counts, with the recruiter's override in place of the
 * computed score where there is one.
 */
export function computeOverall(
  weights: MatchingWeights,
  scores: CriterionScores,
  overrides: CriterionOverride[] = [],
): number {
  const total = MATCH_WEIGHT_KEYS.reduce(
    (sum, key) => sum + weights[key] * effectiveScore(scores, overrides, key),
    0,
  );
  return Math.round(total / 100);
}

/** Strengths and gaps for the dashboard come from the criteria, not from free text (ADR-007). */
export function strengthsAndGaps(criteria: CriterionResult[]): {
  strengths: CriterionResult[];
  gaps: CriterionResult[];
  toConfirm: { key: MatchWeightKey; text: string }[];
} {
  return {
    strengths: criteria.filter((c) => c.level === 'strong'),
    gaps: criteria.filter((c) => c.level === 'gap' || c.level === 'partial'),
    toConfirm: criteria.flatMap((c) => c.toConfirm.map((text) => ({ key: c.key, text }))),
  };
}
