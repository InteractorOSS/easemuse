// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const CANDIDATE_SOURCES = [
  'linkedin',
  'referral',
  'direct_sourcing',
  'database',
  'networking',
  'other',
] as const;
export type CandidateSourceValue = (typeof CANDIDATE_SOURCES)[number];

/** `POST /candidates/intake`: the source and optional profile link, plus the resume file or pasted text. */
export const candidateIntakeSchema = z.object({
  source: z.enum(CANDIDATE_SOURCES),
  profileUrl: z
    .string()
    .trim()
    .max(500)
    .url()
    .or(z.literal('').transform(() => undefined))
    .optional(),
});
export type CandidateIntake = z.infer<typeof candidateIntakeSchema>;

/** JSON form of the intake, for a profile pasted as text. */
export const candidateIntakeTextSchema = candidateIntakeSchema.extend({
  profileText: z.string().trim().min(50).max(100_000),
});
export type CandidateIntakeText = z.infer<typeof candidateIntakeTextSchema>;

export const CANDIDATE_STATUSES = ['draft', 'active', 'discarded'] as const;
export type CandidateStatusValue = (typeof CANDIDATE_STATUSES)[number];

export const DUPLICATE_RESOLUTIONS = ['create', 'merge', 'link'] as const;
export type DuplicateResolution = (typeof DUPLICATE_RESOLUTIONS)[number];

/**
 * `POST /candidates`: confirm a draft (US-202, US-203). Without a resolution the draft is saved only
 * if no duplicate was found. `create` anyway needs a reason when duplicates exist; `merge` and `link`
 * name the existing candidate.
 */
export const confirmCandidateInputSchema = z
  .object({
    draftId: z.guid(),
    resolution: z.enum(DUPLICATE_RESOLUTIONS).optional(),
    targetId: z.guid().optional(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine(
    (v) => (v.resolution === 'merge' || v.resolution === 'link' ? Boolean(v.targetId) : true),
    {
      message: 'Choose the existing candidate',
      path: ['targetId'],
    },
  );
export type ConfirmCandidateInput = z.infer<typeof confirmCandidateInputSchema>;

/** `PATCH /candidates/:id/do-not-contact`: setting or clearing the flag always needs a reason. */
export const doNotContactInputSchema = z.object({
  value: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});
export type DoNotContactInput = z.infer<typeof doNotContactInputSchema>;
