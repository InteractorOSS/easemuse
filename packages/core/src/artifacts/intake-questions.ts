// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { INTAKE_TOPICS } from '../schemas/intake';
import { JD_SECTIONS } from './structured-jd';

/** What a question is about: one of the ten intake topics, or a gap in the JD ("ask the hiring manager"). */
export const QUESTION_TOPICS = ['jd_gap', ...INTAKE_TOPICS] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

/** What the model returns for A2: no ids yet. */
export const intakeQuestionsModelOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        topic: z.enum(QUESTION_TOPICS),
        /** For a `jd_gap` question: the JD section it fills. */
        section: z.enum(JD_SECTIONS).optional(),
        question: z.string().trim().min(5).max(400),
        /** Why this is worth asking, in one line. */
        reason: z.string().max(300),
      }),
    )
    .max(60),
});
export type IntakeQuestionsModelOutput = z.infer<typeof intakeQuestionsModelOutputSchema>;

/** The artifact content: the questions with stable ids, editable by the recruiter. */
export const intakeQuestionsContentSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        topic: z.enum(QUESTION_TOPICS),
        section: z.enum(JD_SECTIONS).optional(),
        question: z.string().trim().min(1).max(600),
        reason: z.string().max(300).default(''),
      }),
    )
    .max(100),
});
export type IntakeQuestionsContent = z.infer<typeof intakeQuestionsContentSchema>;
