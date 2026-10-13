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

/** Most resumes one position upload takes at a time (G#9). */
export const POSITION_INTAKE_MAX_FILES = 10;

/**
 * `POST /candidates/intake`: the source and optional profile link, plus the resume file or pasted
 * text. `positionId` marks the position the resume was uploaded for (G#9); the draft is still only
 * a draft, and nothing is added to the position until the recruiter confirms.
 */
export const candidateIntakeSchema = z.object({
  source: z.enum(CANDIDATE_SOURCES),
  profileUrl: z
    .string()
    .trim()
    .max(500)
    .url()
    .or(z.literal('').transform(() => undefined))
    .optional(),
  positionId: z
    .guid()
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
 *
 * `positionId` (G#9) also adds the confirmed candidate to that position, and `analyze` then asks for
 * the match analysis: the recruiter's click on "Confirm" is the request (brief 1.1, DP-2).
 */
export const confirmCandidateInputSchema = z
  .object({
    draftId: z.guid(),
    resolution: z.enum(DUPLICATE_RESOLUTIONS).optional(),
    targetId: z.guid().optional(),
    reason: z.string().trim().min(3).max(500).optional(),
    positionId: z.guid().optional(),
    analyze: z.boolean().optional(),
  })
  .refine(
    (v) => (v.resolution === 'merge' || v.resolution === 'link' ? Boolean(v.targetId) : true),
    {
      message: 'Choose the existing candidate',
      path: ['targetId'],
    },
  )
  .refine((v) => !v.analyze || Boolean(v.positionId), {
    message: 'Choose the position to analyze against',
    path: ['positionId'],
  });
export type ConfirmCandidateInput = z.infer<typeof confirmCandidateInputSchema>;

/** `PATCH /candidates/:id/do-not-contact`: setting or clearing the flag always needs a reason. */
export const doNotContactInputSchema = z.object({
  value: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});
export type DoNotContactInput = z.infer<typeof doNotContactInputSchema>;
