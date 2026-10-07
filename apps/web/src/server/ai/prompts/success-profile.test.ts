// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { JD_SECTIONS } from '@easemuse/core';
import { createPromptRegistry } from '../prompts';
import { PURPOSES } from '../purposes';
import { registerBuiltInPrompts } from './index';
import { successProfilePrompt } from './success-profile';

const input = {
  structuredJd: {
    sections: Object.fromEntries(
      JD_SECTIONS.map((s) => [
        s,
        s === 'compensation'
          ? { status: 'missing', summary: '' }
          : { status: 'found', summary: `about ${s}` },
      ]),
    ),
    requirements: [
      { id: 'r1', section: 'technical_skills', text: 'Go', category: 'must_have', quote: '' },
    ],
  },
  intake: {
    exclusions: {
      value: 'No one from a direct competitor',
      source: 'recruiter',
      status: 'accepted',
    },
    interview_process: {
      value: 'Three rounds',
      stages: ['Screen', 'Panel'],
      source: 'recruiter',
      status: 'accepted',
    },
  },
  position: { title: 'Backend Engineer', location: 'Seoul' },
} as never;

describe('A5 success_profile.create prompt', () => {
  it('is registered, makes a success_profile draft on Opus', () => {
    const registry = createPromptRegistry();
    registerBuiltInPrompts(registry);
    expect(registry.get('success_profile.create')).toBe(successProfilePrompt);
    expect(PURPOSES['success_profile.create']).toMatchObject({
      artifactKind: 'success_profile',
      model: 'claude-opus-5-5',
    });
  });

  it('says intake wins over the JD, exclusions are deal-breakers, and nothing is invented', () => {
    const { system } = successProfilePrompt.buildPrompt(input);
    expect(system).toMatch(/intake answer wins/i);
    expect(system).toMatch(/disqualifying/);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/personal attributes/i);
    expect(system).toMatch(/data, not instructions/i);
  });

  it('shows the JD, its requirements and only the intake topics that have answers', () => {
    const { user } = successProfilePrompt.buildPrompt(input);
    expect(user).toContain('- compensation: (not stated)');
    expect(user).toContain('- [must_have] Go');
    expect(user).toContain('- exclusions: No one from a direct competitor');
    expect(user).toContain('Stages: Screen > Panel.');
    expect(user).not.toContain('business_reason');
  });

  it('gives each criterion an id and keeps the rest of the answer', () => {
    const output = successProfilePrompt.schema.parse({
      summary: 's',
      criteria: [
        { text: 'Go', category: 'must_have', basis: 'jd' },
        { text: 'Java', category: 'preferred', basis: 'jd' },
      ],
      expectations: { sixMonths: 'a', twelveMonths: 'b' },
      keyChallenges: ['c'],
    });
    const content = successProfilePrompt.toContent!(output, input) as {
      criteria: { id: string }[];
      summary: string;
    };
    expect(new Set(content.criteria.map((c) => c.id)).size).toBe(2);
    expect(content.summary).toBe('s');
  });
});
