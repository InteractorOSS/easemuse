// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { MATCH_WEIGHT_KEYS } from './settings';

/** The most candidates one "Analyze" request may cover (US-302). */
export const MAX_BATCH_ANALYSIS = 50;

/** `POST /positions/:id/analyses`: analyze 1 to 50 candidates of the position in the background. */
export const batchAnalysisInputSchema = z.object({
  entryIds: z
    .array(z.guid())
    .min(1)
    .max(MAX_BATCH_ANALYSIS)
    .refine((ids) => new Set(ids).size === ids.length, 'Each candidate can appear once'),
});
export type BatchAnalysisInput = z.infer<typeof batchAnalysisInputSchema>;

export const BATCH_ENTRY_STATUSES = ['pending', 'running', 'done', 'failed', 'skipped'] as const;
export type BatchEntryStatus = (typeof BATCH_ENTRY_STATUSES)[number];

/** What the batch job reports on `job:<id>` after every step. */
export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  /** Per candidate (pipeline entry id). `reason` is a short code such as `budget_exceeded` or `conflict`. */
  entries: Record<string, { status: BatchEntryStatus; analysisId?: string; reason?: string }>;
}

const scoreShape = z.number().int().min(0).max(100);
const overrideReason = z.string().trim().min(3).max(500);

/**
 * `PATCH /analyses/:id/overrides` (FR-MAT-04): the recruiter changes the overall score or one
 * criterion's score, with a reason. `score: null` takes the override away and returns to the
 * computed value. The computed value is always kept beside the override.
 */
export const matchOverrideInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('overall'), score: scoreShape.nullable(), reason: overrideReason }),
  z.object({
    kind: z.literal('criterion'),
    key: z.enum(MATCH_WEIGHT_KEYS),
    score: scoreShape.nullable(),
    reason: overrideReason,
  }),
]);
export type MatchOverrideInput = z.infer<typeof matchOverrideInputSchema>;

/** `PUT /analyses/:id/assessment` (FR-MAT-05): the recruiter's own words; AI never writes this. */
export const recruiterAssessmentInputSchema = z.object({ text: z.string().trim().max(4000) });
export type RecruiterAssessmentInput = z.infer<typeof recruiterAssessmentInputSchema>;
