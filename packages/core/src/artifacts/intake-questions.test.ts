// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  INTAKE_TOPICS,
  QUESTION_TOPICS,
  intakeQuestionsContentSchema,
  intakeQuestionsModelOutputSchema,
  parseArtifactContent,
} from '..';

describe('intake questions', () => {
  it('covers the ten intake topics plus JD gaps', () => {
    expect(QUESTION_TOPICS).toHaveLength(INTAKE_TOPICS.length + 1);
    expect(QUESTION_TOPICS).toContain('jd_gap');
  });

  it('accepts a gap question with its section, and rejects an unknown topic or section', () => {
    const q = {
      topic: 'jd_gap',
      section: 'compensation',
      question: 'What is the pay range?',
      reason: 'The JD has none',
    };
    expect(intakeQuestionsModelOutputSchema.safeParse({ questions: [q] }).success).toBe(true);
    expect(
      intakeQuestionsModelOutputSchema.safeParse({ questions: [{ ...q, topic: 'salary' }] })
        .success,
    ).toBe(false);
    expect(
      intakeQuestionsModelOutputSchema.safeParse({ questions: [{ ...q, section: 'perks' }] })
        .success,
    ).toBe(false);
  });

  it('is the content schema of the intake_questions kind, ids required', () => {
    const ok = { questions: [{ id: 'q1', topic: 'business_reason', question: 'Why now?' }] };
    expect(intakeQuestionsContentSchema.parse(ok).questions[0]!.reason).toBe('');
    expect(() => parseArtifactContent('intake_questions', ok)).not.toThrow();
    expect(() =>
      parseArtifactContent('intake_questions', {
        questions: [{ topic: 'business_reason', question: 'Why now?' }],
      }),
    ).toThrow();
  });
});
