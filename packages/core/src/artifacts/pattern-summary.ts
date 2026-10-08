// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/**
 * A18, the AI summary of the patterns in a client's history (brief 14, FR-KNW-03). The model gets
 * numbered facts (counts out of the agency's own records) and writes sentences that cite them by
 * id. Code, not the model, attaches the evidence to each sentence, so the links to the records
 * behind a statement are always exact.
 */
export const MAX_SUMMARY_STATEMENTS = 20;

/** What the model writes: sentences, each naming the facts it rests on. */
export const patternSummaryModelOutputSchema = z.object({
  statements: z
    .array(
      z.object({
        text: z.string().trim().min(3).max(500),
        factIds: z.array(z.string().min(1).max(20)).min(1).max(6),
      }),
    )
    .min(1)
    .max(MAX_SUMMARY_STATEMENTS),
});
export type PatternSummaryModelOutput = z.infer<typeof patternSummaryModelOutputSchema>;

const ref = z.object({ entryId: z.guid(), positionId: z.guid() });

/** One fact a statement rests on, with the records it was counted from. */
export const summaryEvidenceSchema = z.object({
  factId: z.string().min(1).max(20),
  label: z.string().max(300),
  n: z.number().int().min(0),
  hits: z.number().int().min(0),
  rate: z.number().int().min(0).max(100).nullable(),
  small: z.boolean(),
  refCount: z.number().int().min(0),
  refs: z.array(ref).max(40),
});
export type SummaryEvidence = z.infer<typeof summaryEvidenceSchema>;

export const summaryStatementSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(3).max(600),
  /** Rests on fewer records than the sample threshold: shown as tentative. */
  tentative: z.boolean(),
  evidence: z.array(summaryEvidenceSchema).min(1).max(6),
});
export type SummaryStatement = z.infer<typeof summaryStatementSchema>;

/** The stored draft. The recruiter edits the sentences; the evidence stays attached to each. */
export const patternSummaryContentSchema = z.object({
  clientId: z.guid(),
  clientName: z.string().max(200),
  /** Day the records were read, YYYY-MM-DD. */
  asOf: z.string().max(10),
  records: z.number().int().min(0),
  positions: z.number().int().min(0),
  statements: z.array(summaryStatementSchema).max(30),
  checks: z.object({
    /** Sentences removed because a number, a fact id or a protected characteristic did not check out. */
    removed: z.number().int().min(0),
    /** Report values left out of the facts because they name a protected characteristic. */
    withheld: z.number().int().min(0),
  }),
});
export type PatternSummaryContent = z.infer<typeof patternSummaryContentSchema>;
