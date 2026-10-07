// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const INTERVIEW_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

/** Statuses after which nothing more is expected of the round, so its reminder task closes. */
export const CLOSED_INTERVIEW_STATUSES: readonly InterviewStatus[] = [
  'completed',
  'cancelled',
  'no_show',
];

export const FEEDBACK_CRITERIA = [
  'technicalFit',
  'leadershipFit',
  'communication',
  'culturalFit',
  'industryExperience',
] as const;
export type FeedbackCriterion = (typeof FEEDBACK_CRITERIA)[number];

export const FEEDBACK_RATINGS = ['strong', 'moderate', 'gap'] as const;
export type FeedbackRatingValue = (typeof FEEDBACK_RATINGS)[number];

export const FEEDBACK_FROM = ['hm', 'candidate'] as const;
export type FeedbackFrom = (typeof FEEDBACK_FROM)[number];

const interviewer = z.string().trim().min(1).max(120);

/** `POST /pipeline/:id/interviews` (FR-IVW-01): one round. */
export const createInterviewInputSchema = z.object({
  roundName: z.string().trim().min(1).max(120),
  scheduledAt: z.coerce.date().nullish(),
  format: z.string().trim().max(60).nullish(),
  interviewers: z.array(interviewer).max(10).default([]),
});
export type CreateInterviewInput = z.infer<typeof createInterviewInputSchema>;

/** `PATCH /pipeline/:id/interviews/:interviewId` */
export const updateInterviewInputSchema = z
  .object({
    roundName: z.string().trim().min(1).max(120),
    scheduledAt: z.coerce.date().nullable(),
    format: z.string().trim().max(60).nullable(),
    interviewers: z.array(interviewer).max(10),
    status: z.enum(INTERVIEW_STATUSES),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdateInterviewInput = z.infer<typeof updateInterviewInputSchema>;

/**
 * `POST /pipeline/:id/interviews/:interviewId/feedback` (FR-IVW-03): the hiring manager's feedback,
 * recorded by the recruiter, or the candidate's own, kept apart. Each rating is optional.
 */
export const recordFeedbackInputSchema = z
  .object({
    fromRole: z.enum(FEEDBACK_FROM),
    ratings: z.object(
      Object.fromEntries(
        FEEDBACK_CRITERIA.map((k) => [k, z.enum(FEEDBACK_RATINGS).nullish()]),
      ) as Record<
        FeedbackCriterion,
        z.ZodOptional<
          z.ZodNullable<z.ZodEnum<{ strong: 'strong'; moderate: 'moderate'; gap: 'gap' }>>
        >
      >,
    ),
    comments: z.string().trim().max(4000).optional(),
  })
  .refine((v) => Object.values(v.ratings).some(Boolean) || Boolean(v.comments), {
    message: 'Give at least one rating or a comment',
    path: ['comments'],
  });
export type RecordFeedbackInput = z.infer<typeof recordFeedbackInputSchema>;
