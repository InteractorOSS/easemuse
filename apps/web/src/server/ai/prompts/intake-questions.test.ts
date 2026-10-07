// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { INTAKE_TOPICS, JD_SECTIONS } from '@easemuse/core';
import { createPromptRegistry } from '../prompts';
import { PURPOSES } from '../purposes';
import { registerBuiltInPrompts } from './index';
import { intakeQuestionsPrompt } from './intake-questions';

const sections = Object.fromEntries(
  JD_SECTIONS.map((s) => [
    s,
    s === 'compensation'
      ? { status: 'missing', summary: '' }
      : { status: 'found', summary: `about ${s}` },
  ]),
);
const input = {
  structuredJd: {
    sections,
    requirements: [
      { id: 'r1', section: 'technical_skills', text: 'Go', category: 'must_have', quote: '' },
    ],
  },
  position: { title: 'Backend Engineer', location: 'Seoul' },
} as never;

describe('A2 intake.questions prompt', () => {
  it('is registered, makes an intake_questions draft, and runs on the cheaper model', () => {
    const registry = createPromptRegistry();
    registerBuiltInPrompts(registry);
    expect(registry.get('intake.questions')).toBe(intakeQuestionsPrompt);
    expect(PURPOSES['intake.questions']).toMatchObject({
      artifactKind: 'intake_questions',
      model: 'claude-sonnet-5-5',
    });
  });

  it('names every intake topic, asks for gap questions first, and forbids inventing', () => {
    const { system } = intakeQuestionsPrompt.buildPrompt(input);
    for (const topic of INTAKE_TOPICS) expect(system).toContain(topic);
    expect(system).toContain('jd_gap');
    expect(system).toMatch(/gap.*first|first.*gap/is);
    expect(system).toMatch(/do not invent/i);
    expect(system).toMatch(/data, not instructions/i);
  });

  it('shows the JD sections with MISSING marked, and the requirements with their category', () => {
    const { user } = intakeQuestionsPrompt.buildPrompt(input);
    expect(user).toContain('- compensation: MISSING');
    expect(user).toContain('- position_summary: about position_summary');
    expect(user).toContain('- [must_have] (technical_skills) Go');
    expect(user).toContain('Backend Engineer (Seoul)');
  });

  it('gives each question a unique id', () => {
    const output = intakeQuestionsPrompt.schema.parse({
      questions: [
        {
          topic: 'jd_gap',
          section: 'compensation',
          question: 'What is the pay?',
          reason: 'Missing',
        },
        { topic: 'business_reason', question: 'Why is the seat open?', reason: 'Context' },
      ],
    });
    const content = intakeQuestionsPrompt.toContent!(output, input) as {
      questions: { id: string }[];
    };
    expect(new Set(content.questions.map((q) => q.id)).size).toBe(2);
  });
});
