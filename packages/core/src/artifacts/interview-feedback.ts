// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { FEEDBACK_CRITERIA, FEEDBACK_FROM, FEEDBACK_RATINGS } from '../schemas/interviews';

/**
 * A17, pasted feedback into the five ratings (brief §11, FR-IVW-04): a hiring manager's or
 * candidate's feedback email becomes a DRAFT of Technical Fit, Leadership Fit, Communication,
 * Cultural Fit and Industry Experience (Strong, Moderate or Gap) plus comments. The recruiter
 * confirms each rating; only then is it recorded as interview feedback.
 */
const modelRating = z.object({
  /** Null when the email does not say. A criterion the email does not cover is never guessed. */
  rating: z.enum(FEEDBACK_RATINGS).nullable(),
  /** The words of the email the rating rests on, kept short. */
  evidence: z.string().trim().max(400),
});

/** What the model writes. */
export const interviewFeedbackModelOutputSchema = z.object({
  ratings: z.object(
    Object.fromEntries(FEEDBACK_CRITERIA.map((k) => [k, modelRating])) as Record<
      (typeof FEEDBACK_CRITERIA)[number],
      typeof modelRating
    >,
  ),
  /** The comments in the email, neutral and shortened; empty when there are none. */
  comments: z.string().trim().max(4000),
});
export type InterviewFeedbackModelOutput = z.infer<typeof interviewFeedbackModelOutputSchema>;

const storedRating = z.object({
  rating: z.enum(FEEDBACK_RATINGS).nullable().default(null),
  evidence: z.string().max(400).default(''),
  /** The recruiter checked this rating against the email. */
  confirmed: z.boolean().default(false),
});
export type FeedbackRatingDraft = z.infer<typeof storedRating>;

const storedRatings = z.object(
  Object.fromEntries(
    FEEDBACK_CRITERIA.map((k) => [k, storedRating.default(() => storedRating.parse({}))]),
  ) as Record<(typeof FEEDBACK_CRITERIA)[number], z.ZodDefault<typeof storedRating>>,
);

export const interviewFeedbackContentSchema = z.object({
  fromRole: z.enum(FEEDBACK_FROM).default('hm'),
  ratings: storedRatings.default(() => storedRatings.parse({})),
  comments: z.string().max(4000).default(''),
  /** The pasted email, kept with the record. */
  source: z.string().max(20_000).default(''),
});
export type InterviewFeedbackContent = z.infer<typeof interviewFeedbackContentSchema>;

/** The criteria that carry a rating the recruiter has not confirmed yet. */
export function unconfirmedFeedbackCriteria(content: InterviewFeedbackContent) {
  return FEEDBACK_CRITERIA.filter(
    (k) => content.ratings[k].rating !== null && !content.ratings[k].confirmed,
  );
}

/** `POST …/feedback/structure`: whose feedback it is, and the pasted text. */
export const feedbackEmailInputSchema = z.object({
  fromRole: z.enum(FEEDBACK_FROM).default('hm'),
  email: z.string().trim().min(10).max(20_000),
});
export type FeedbackEmailInput = z.infer<typeof feedbackEmailInputSchema>;
