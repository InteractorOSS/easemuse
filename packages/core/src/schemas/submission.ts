// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { guardOverrideSchema } from './guards';

export const SUBMISSION_METHODS = ['portal', 'email', 'other'] as const;
export type SubmissionMethod = (typeof SUBMISSION_METHODS)[number];

/**
 * `POST /pipeline/:id/submissions` (FR-SUB-03, US-802): the recruiter records that they submitted the
 * approved report and resume. The two ids pin what they saw; if either was replaced since, the call
 * is refused (409) so the record always names the exact documents sent.
 */
export const recordSubmissionInputSchema = z.object({
  reportVersionId: z.guid(),
  tailoredResumeId: z.guid(),
  toContactId: z.guid(),
  method: z.enum(SUBMISSION_METHODS),
  submittedAt: z.coerce.date(),
  /** Needed when this candidate was already submitted to the same client (FR-SUB-04). */
  duplicateReason: z.string().trim().min(3).max(500).optional(),
  overrideGuards: z.array(guardOverrideSchema).max(8).optional(),
});
export type RecordSubmissionInput = z.infer<typeof recordSubmissionInputSchema>;
