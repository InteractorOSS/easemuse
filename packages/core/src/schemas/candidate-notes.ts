// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** Longest note, and the most tags one candidate can carry. */
export const MAX_NOTE_LENGTH = 4000;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/**
 * A tag is a short label the agency makes up ("silicon-valley", "returner"). Stored lowercase and
 * trimmed so the same label is always the same filter (FR-SRC-09).
 */
export const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TAG_LENGTH)
  .transform((tag) => tag.toLowerCase().replace(/\s+/g, ' '))
  // A comma would break the comma-separated tag filter in the pool search.
  .refine((tag) => !tag.includes(','), { message: 'A tag cannot contain a comma' });

/** `PUT /candidates/:id/tags`: the whole list replaces the old one. */
export const candidateTagsInputSchema = z.object({
  tags: z
    .array(tagSchema)
    .max(MAX_TAGS)
    .transform((tags) => [...new Set(tags)]),
});
export type CandidateTagsInput = z.infer<typeof candidateTagsInputSchema>;

/** `POST` and `PATCH` on a candidate's notes (FR-SRC-09): free text only the agency sees. */
export const candidateNoteInputSchema = z.object({
  body: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});
export type CandidateNoteInput = z.infer<typeof candidateNoteInputSchema>;
