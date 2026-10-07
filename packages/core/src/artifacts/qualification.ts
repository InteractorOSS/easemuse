// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { QUALIFICATION_TOPICS } from './call-questions';

export const QUALIFICATION_LEVELS = ['high', 'medium', 'low'] as const;
export type QualificationLevel = (typeof QUALIFICATION_LEVELS)[number];

/** Topics that also carry a High / Medium / Low reading (brief 8 examples). */
export const LEVEL_TOPICS = ['interest', 'interviewReadiness', 'counterofferRisk'] as const;

const modelField = z.object({
  /** What the candidate said, in short plain words; empty if it was not discussed. */
  value: z.string().trim().max(400),
  level: z.enum(QUALIFICATION_LEVELS).nullable(),
  /** True when the model concluded it rather than the notes saying it. */
  inferred: z.boolean(),
});

/** What the model writes from the call notes. */
export const qualificationModelOutputSchema = z.object({
  fields: z.object(
    Object.fromEntries(QUALIFICATION_TOPICS.map((k) => [k, modelField])) as Record<
      (typeof QUALIFICATION_TOPICS)[number],
      typeof modelField
    >,
  ),
});
export type QualificationModelOutput = z.infer<typeof qualificationModelOutputSchema>;

const storedField = modelField.extend({
  value: z.string().trim().max(400).default(''),
  level: z.enum(QUALIFICATION_LEVELS).nullable().default(null),
  inferred: z.boolean().default(false),
  /** The recruiter checked this field against the call. Approving needs every filled field confirmed. */
  confirmed: z.boolean().default(false),
});
export type QualificationField = z.infer<typeof storedField>;

/** The qualification record (FR-QUA-02): structured fields and the recruiter's raw notes. */
const storedFields = z.object(
  Object.fromEntries(
    QUALIFICATION_TOPICS.map((k) => [k, storedField.default(() => storedField.parse({}))]),
  ) as Record<(typeof QUALIFICATION_TOPICS)[number], z.ZodDefault<typeof storedField>>,
);

export const qualificationContentSchema = z.object({
  fields: storedFields.default(() => storedFields.parse({})),
  notes: z.string().max(20_000).default(''),
});
export type QualificationContent = z.infer<typeof qualificationContentSchema>;

/** A field counts once it says something. */
export const isFilled = (f: Pick<QualificationField, 'value' | 'level'>): boolean =>
  f.value.trim() !== '' || f.level !== null;

/** The topics that still need the recruiter's confirmation. */
export function unconfirmedTopics(content: QualificationContent): string[] {
  return QUALIFICATION_TOPICS.filter(
    (k) => isFilled(content.fields[k]) && !content.fields[k].confirmed,
  );
}

/** `POST /pipeline/:id/qualification/structure`: the recruiter's rough call notes. */
export const qualificationNotesInputSchema = z.object({
  notes: z.string().trim().min(10).max(20_000),
});
export type QualificationNotesInput = z.infer<typeof qualificationNotesInputSchema>;
