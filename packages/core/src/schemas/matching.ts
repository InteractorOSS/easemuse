// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

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
