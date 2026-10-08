// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((s) => s.replace(/\s*\n+\s*/g, ' '));

/**
 * "Find in my pool" (US-205, brief 4.3, A8): up to 25 existing candidates that look like a
 * position's confirmed success profile, each with a one-line reason. These are suggestions for the
 * recruiter's own review: the similarity figure is a reference and never decides who is shown, and
 * nobody is added to the position until the recruiter adds them.
 */
export const POOL_MATCH_LIMIT = 25;

/** What the model returns for A8: a reason per candidate it was shown, by the reference it was given. */
export const similarCandidatesModelOutputSchema = z.object({
  items: z
    .array(
      z.object({
        ref: z.string().min(1).max(20),
        reason: oneLine(240),
        /** What the recruiter should check or what is missing; null when nothing stands out. */
        caveat: oneLine(200).nullable(),
      }),
    )
    .max(POOL_MATCH_LIMIT),
});
export type SimilarCandidatesModelOutput = z.infer<typeof similarCandidatesModelOutputSchema>;

export const similarCandidatesContentSchema = z.object({
  generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** `semantic`: Voyage embeddings. `keyword`: full-text, used when embeddings are not available. */
  basis: z.enum(['semantic', 'keyword']),
  items: z
    .array(
      z.object({
        candidateId: z.guid(),
        /** 0 to 1, cosine similarity (semantic) or null (keyword). A reference only. */
        similarity: z.number().min(0).max(1).nullable(),
        reason: oneLine(240),
        caveat: oneLine(200).nullable(),
      }),
    )
    .max(POOL_MATCH_LIMIT),
  /** Active candidates in the pool that were not searched because their profile is not indexed yet. */
  notIndexed: z.number().int().min(0),
  poolSize: z.number().int().min(0),
  /** Candidates left out only because they are already in this position's pipeline. */
  alreadyInPosition: z.number().int().min(0).default(0),
});
export type SimilarCandidatesContent = z.infer<typeof similarCandidatesContentSchema>;

/** "Check open positions" (US-206, brief 4.3, A9): the fit of one candidate to each open position. */
export const FIT_LEVELS = ['strong', 'moderate', 'low'] as const;
export type FitLevel = (typeof FIT_LEVELS)[number];

export const portfolioFitModelOutputSchema = z.object({
  items: z
    .array(
      z.object({
        ref: z.string().min(1).max(20),
        fit: z.enum(FIT_LEVELS),
        reason: oneLine(240),
      }),
    )
    .max(60),
});
export type PortfolioFitModelOutput = z.infer<typeof portfolioFitModelOutputSchema>;

export const PORTFOLIO_SKIP_REASONS = [
  'no_success_profile',
  'already_in_pipeline',
  'no_answer',
] as const;

export const portfolioFitContentSchema = z.object({
  generatedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(z.object({ positionId: z.guid(), fit: z.enum(FIT_LEVELS), reason: oneLine(240) }))
    .max(60),
  /** Open positions that were not assessed, with the reason: nothing is hidden silently. */
  notAssessed: z
    .array(z.object({ positionId: z.guid(), why: z.enum(PORTFOLIO_SKIP_REASONS) }))
    .max(200),
  /** More open positions than one assessment covers; the rest are not assessed. */
  truncated: z.boolean(),
});
export type PortfolioFitContent = z.infer<typeof portfolioFitContentSchema>;

/** The most open positions one assessment covers. */
export const PORTFOLIO_POSITION_LIMIT = 30;
/** Position statuses that count as open for "Check open positions". */
export const OPEN_POSITION_STATUSES = ['intake', 'sourcing', 'interviewing'] as const;
