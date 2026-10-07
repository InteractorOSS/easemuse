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
