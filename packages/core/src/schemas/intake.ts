// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** The ten topics of the hiring manager intake (brief 3.4, FR-INT-09). */
export const INTAKE_TOPICS = [
  'business_reason',
  'key_challenges',
  'expected_results',
  'must_have_experience',
  'preferred_experience',
  'exclusions',
  'org_reporting',
  'compensation_range',
  'interview_process',
  'expected_timeline',
] as const;
export type IntakeTopic = (typeof INTAKE_TOPICS)[number];

/** One topic's answer. `hm_portal` answers stay `proposed` until the recruiter accepts them (FR-HMP-03). */
export const intakeAnswerSchema = z.object({
  value: z.string().trim().max(4000),
  /** The interview stages, in order, for the interview-process topic. */
  stages: z.array(z.string().trim().min(1).max(120)).max(15).optional(),
  source: z.enum(['recruiter', 'hm_portal']).default('recruiter'),
  status: z.enum(['proposed', 'accepted']).default('accepted'),
});
export type IntakeAnswer = z.infer<typeof intakeAnswerSchema>;

const answersShape = Object.fromEntries(
  INTAKE_TOPICS.map((t) => [t, intakeAnswerSchema.optional()]),
) as Record<IntakeTopic, z.ZodOptional<typeof intakeAnswerSchema>>;
export const intakeAnswersSchema = z.object(answersShape);
export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;

/** `PUT /positions/:id/intake`: the topics the recruiter filled in; topics left out keep their answer. */
export const intakeInputSchema = z.object({
  answers: z.object(
    Object.fromEntries(
      INTAKE_TOPICS.map((t) => [
        t,
        z
          .object({
            value: z.string().trim().max(4000),
            stages: z.array(z.string().trim().min(1).max(120)).max(15).optional(),
          })
          .optional(),
      ]),
    ) as Record<
      IntakeTopic,
      z.ZodOptional<
        z.ZodObject<{ value: z.ZodString; stages: z.ZodOptional<z.ZodArray<z.ZodString>> }>
      >
    >,
  ),
});
export type IntakeInput = z.infer<typeof intakeInputSchema>;

export const APPROVAL_METHODS = ['email', 'phone', 'other'] as const;

/** `POST /positions/:id/jd-approval`: the recruiter records what the hiring manager decided (brief 3.4). */
export const recordApprovalInputSchema = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  approverName: z.string().trim().min(2).max(120),
  method: z.enum(APPROVAL_METHODS),
  decidedAt: z.coerce.date(),
  comments: z.string().trim().max(2000).optional(),
});
export type RecordApprovalInput = z.infer<typeof recordApprovalInputSchema>;
