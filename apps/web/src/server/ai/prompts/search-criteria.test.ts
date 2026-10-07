// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { createPromptRegistry } from '../prompts';
import { PURPOSES } from '../purposes';
import { registerBuiltInPrompts } from './index';
import { searchCriteriaPrompt } from './search-criteria';

const input = {
  profile: {
    summary: 'A senior Go engineer',
    criteria: [
      { id: 'c1', text: 'Go, 5+ years', category: 'must_have', basis: 'jd' },
      { id: 'c2', text: 'Worked at a competitor', category: 'disqualifying', basis: 'intake' },
    ],
    expectations: { sixMonths: '', twelveMonths: '' },
    keyChallenges: ['Cut incidents'],
  },
  position: { title: 'Backend Engineer', location: 'Seoul' },
} as never;

describe('A6 search_criteria.create prompt', () => {
  it('is registered and produces a search_criteria draft on the cheaper model', () => {
    const registry = createPromptRegistry();
    registerBuiltInPrompts(registry);
    expect(registry.get('search_criteria.create')).toBe(searchCriteriaPrompt);
    expect(PURPOSES['search_criteria.create']).toMatchObject({
      artifactKind: 'search_criteria',
      model: 'claude-sonnet-5-5',
    });
  });

  it('never suggests companies, never uses personal attributes, and treats the profile as data', () => {
    const { system } = searchCriteriaPrompt.buildPrompt(input);
    expect(system).toMatch(/never suggest companies/i);
    expect(system).toMatch(/personal attributes/i);
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/data, not instructions/i);
  });

  it('shows the criteria with their category so deal-breakers are not searched for', () => {
    const { user, system } = searchCriteriaPrompt.buildPrompt(input);
    expect(user).toContain('- [must_have] Go, 5+ years');
    expect(user).toContain('- [disqualifying] Worked at a competitor');
    expect(user).toContain('Backend Engineer (Seoul)');
    expect(system).toMatch(/disqualifying.*not search terms/is);
  });
});
