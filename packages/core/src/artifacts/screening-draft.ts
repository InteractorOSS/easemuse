// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { SCREENING_ITEMS, SCREENING_RATINGS, type ScreeningItem } from '../schemas/screening';

const suggestion = z.object({
  /** A reading of the profile on this item; null when the profile does not say enough. */
  rating: z.enum(SCREENING_RATINGS).nullable(),
  /** One plain sentence with the fact behind the reading; empty when there is none. */
  note: z.string().trim().max(300),
});

const itemShape = Object.fromEntries(SCREENING_ITEMS.map((k) => [k, suggestion])) as Record<
  ScreeningItem,
  typeof suggestion
>;

/**
 * A11, suggestions for the screening checklist (brief 6, FR-SCR-03). Only a draft: the recruiter
 * copies what they agree with into the checklist, which is their own record.
 */
export const screeningDraftContentSchema = z.object({ items: z.object(itemShape) });
export type ScreeningDraftContent = z.infer<typeof screeningDraftContentSchema>;
