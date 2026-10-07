// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** The topics of the qualification call (brief 8, FR-QUA-01), plus the open points from the match analysis. */
export const QUALIFICATION_TOPICS = [
  'interest',
  'motivation',
  'reasonForMove',
  'satisfaction',
  'compensation',
  'location',
  'workAuthorization',
  'availability',
  'interviewReadiness',
  'otherProcesses',
  'decisionFactors',
  'counterofferRisk',
] as const;
export type QualificationTopic = (typeof QUALIFICATION_TOPICS)[number];

export const CALL_QUESTION_TOPICS = [...QUALIFICATION_TOPICS, 'toConfirm'] as const;
export type CallQuestionTopic = (typeof CALL_QUESTION_TOPICS)[number];

const question = z.object({
  topic: z.enum(CALL_QUESTION_TOPICS),
  question: z.string().trim().min(3).max(400),
});

/** What the model writes: questions grouped by topic, in the order to ask them. */
export const callQuestionsModelOutputSchema = z.object({
  questions: z.array(question).min(1).max(40),
});
export type CallQuestionsModelOutput = z.infer<typeof callQuestionsModelOutputSchema>;

/** The stored list: each question gets an id so the recruiter can edit, reorder and delete it. */
export const callQuestionsContentSchema = z.object({
  questions: z.array(question.extend({ id: z.string().min(1).max(64) })).max(60),
});
export type CallQuestionsContent = z.infer<typeof callQuestionsContentSchema>;
