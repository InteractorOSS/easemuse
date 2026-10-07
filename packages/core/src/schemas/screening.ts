// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** The 14 screening items (brief 6, FR-SCR-01). The recruiter rates and notes each one; none is mandatory. */
export const SCREENING_ITEMS = [
  'careerConsistency',
  'jobChanges',
  'employmentGaps',
  'scopeOfResponsibility',
  'teamSize',
  'reportingStructure',
  'accomplishments',
  'technicalCompetency',
  'leadershipCompetency',
  'compensationExpectation',
  'location',
  'workAuthorization',
  'relocation',
  'careerMotivation',
] as const;
export type ScreeningItem = (typeof SCREENING_ITEMS)[number];

/** The recruiter's reading of an item. Unrated items are simply absent. */
export const SCREENING_RATINGS = ['strong', 'adequate', 'concern'] as const;
export type ScreeningRating = (typeof SCREENING_RATINGS)[number];

export const screeningEntrySchema = z.object({
  rating: z.enum(SCREENING_RATINGS).nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
});
export type ScreeningEntry = z.infer<typeof screeningEntrySchema>;

export const screeningItemsSchema = z.object(
  Object.fromEntries(SCREENING_ITEMS.map((k) => [k, screeningEntrySchema.optional()])) as Record<
    ScreeningItem,
    z.ZodOptional<typeof screeningEntrySchema>
  >,
);
export type ScreeningItems = z.infer<typeof screeningItemsSchema>;

/**
 * `PUT /pipeline/:id/screening`: the items to set. An item left out keeps its value; an item with no
 * rating and no notes is cleared.
 */
export const screeningInputSchema = z.object({ items: screeningItemsSchema });
export type ScreeningInput = z.infer<typeof screeningInputSchema>;

export const SCREENING_CLASSES = ['priority', 'potential', 'hold', 'not_qualified'] as const;
export type ScreeningClassValue = (typeof SCREENING_CLASSES)[number];

/** Only these continue to outreach (handoff section 3). */
export const OUTREACH_CLASSES: readonly ScreeningClassValue[] = ['priority', 'potential'];

/** `POST /pipeline/:id/classification` (FR-SCR-02): a recruiter's call; Not Qualified always gives a reason. */
export const classificationInputSchema = z
  .object({
    screeningClass: z.enum(SCREENING_CLASSES),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .refine((v) => v.screeningClass !== 'not_qualified' || Boolean(v.reason), {
    message: 'Say why',
    path: ['reason'],
  });
export type ClassificationInput = z.infer<typeof classificationInputSchema>;
