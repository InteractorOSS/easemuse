// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { INTAKE_TOPICS } from './intake';

/** `GET /positions/:id/patterns`: the pattern reports for the position's client, or for every client the viewer can see. */
export const patternsQuerySchema = z.object({
  scope: z.enum(['client', 'agency']).default('client'),
});
export type PatternsQuery = z.infer<typeof patternsQuerySchema>;

const topicAnswer = z.object({
  value: z.string().trim().min(1).max(4000),
  stages: z.array(z.string().trim().min(1).max(120)).max(15).optional(),
});

/** Portal: the hiring manager's answers to the intake questionnaire (FR-HMP-03). Arrive as proposals. */
export const hmIntakeAnswersInputSchema = z.object({
  answers: z
    .object(
      Object.fromEntries(INTAKE_TOPICS.map((t) => [t, topicAnswer.optional()])) as Record<
        (typeof INTAKE_TOPICS)[number],
        z.ZodOptional<typeof topicAnswer>
      >,
    )
    .refine((a) => Object.values(a).some(Boolean), { message: 'Answer at least one topic' }),
});
export type HmIntakeAnswersInput = z.infer<typeof hmIntakeAnswersInputSchema>;

/** `POST /positions/:id/intake/proposals`: the recruiter accepts or declines the hiring manager's answer to one topic. */
export const resolveIntakeProposalInputSchema = z.object({
  topic: z.enum(INTAKE_TOPICS),
  accept: z.boolean(),
});
export type ResolveIntakeProposalInput = z.infer<typeof resolveIntakeProposalInputSchema>;

/** The most times a hiring manager can offer for one interview round (FR-HMP-06). */
export const MAX_PROPOSED_SLOTS = 5;

/** Portal: the hiring manager offers up to five times for the next interview round (FR-HMP-06). */
export const proposeSlotsInputSchema = z.object({
  roundName: z.string().trim().min(1).max(120).optional(),
  format: z.string().trim().max(60).optional(),
  slots: z
    .array(z.coerce.date())
    .min(1)
    .max(MAX_PROPOSED_SLOTS)
    .refine((s) => new Set(s.map((d) => d.getTime())).size === s.length, {
      message: 'Offer each time once',
    }),
  note: z.string().trim().max(500).optional(),
});
export type ProposeSlotsInput = z.infer<typeof proposeSlotsInputSchema>;

/** `POST /interview-slot-proposals/:id/resolve`: confirm one of the offered times, which creates the round, or decline them all. */
export const resolveSlotProposalInputSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('confirm'),
    slotIndex: z
      .number()
      .int()
      .min(0)
      .max(MAX_PROPOSED_SLOTS - 1),
    interviewers: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  }),
  z.object({ decision: z.literal('decline') }),
]);
export type ResolveSlotProposalInput = z.infer<typeof resolveSlotProposalInputSchema>;

/** The fields a candidate may update about themselves (FR-CDP-04). Nothing here changes until the recruiter accepts. */
export const CANDIDATE_UPDATE_FIELDS = [
  'email',
  'phone',
  'availability',
  'compensationExpectation',
  'workAuthorization',
] as const;
export type CandidateUpdateField = (typeof CANDIDATE_UPDATE_FIELDS)[number];

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
export const candidateUpdateInputSchema = z
  .object({
    email: z.email().max(254).optional(),
    phone: optionalText(40),
    availability: optionalText(200),
    compensationExpectation: optionalText(200),
    workAuthorization: optionalText(200),
  })
  .refine((v) => CANDIDATE_UPDATE_FIELDS.some((k) => v[k] !== undefined), {
    message: 'Change at least one thing',
  });
export type CandidateUpdateInput = z.infer<typeof candidateUpdateInputSchema>;

/** `POST /candidates/:id/profile-updates/:updateId/resolve` */
export const resolveCandidateUpdateInputSchema = z.object({ accept: z.boolean() });
export type ResolveCandidateUpdateInput = z.infer<typeof resolveCandidateUpdateInputSchema>;

/** What waits on the intake record for the recruiter: the hiring manager's answers per topic (FR-HMP-03). */
export const intakeProposalsSchema = z.object(
  Object.fromEntries(
    INTAKE_TOPICS.map((t) => [
      t,
      z
        .object({
          value: z.string().max(4000),
          stages: z.array(z.string().max(120)).max(15).optional(),
          /** The PortalUser who answered. */
          proposedBy: z.string().max(64),
          at: z.string().max(40),
        })
        .optional(),
    ]),
  ) as Record<
    (typeof INTAKE_TOPICS)[number],
    z.ZodOptional<
      z.ZodObject<{
        value: z.ZodString;
        stages: z.ZodOptional<z.ZodArray<z.ZodString>>;
        proposedBy: z.ZodString;
        at: z.ZodString;
      }>
    >
  >,
);
export type IntakeProposals = z.infer<typeof intakeProposalsSchema>;
