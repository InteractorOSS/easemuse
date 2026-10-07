// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  parseArtifactContent,
  successProfileContentSchema,
  successProfileModelOutputSchema,
} from '..';

const output = {
  summary: 'A senior Go engineer who stabilizes payments.',
  criteria: [
    { text: 'Go, 5+ years', category: 'must_have', basis: 'jd' },
    { text: 'Has not worked for a competitor', category: 'disqualifying', basis: 'intake' },
  ],
  expectations: { sixMonths: 'Owns on-call', twelveMonths: 'Leads the team' },
  keyChallenges: ['Reduce incidents'],
};

describe('success profile', () => {
  it('accepts a model answer with criteria by category and a basis each', () => {
    expect(successProfileModelOutputSchema.safeParse(output).success).toBe(true);
    expect(
      successProfileModelOutputSchema.safeParse({
        ...output,
        criteria: [{ text: 'x', category: 'critical', basis: 'jd' }],
      }).success,
    ).toBe(false);
    expect(
      successProfileModelOutputSchema.safeParse({
        ...output,
        criteria: [{ text: 'x', category: 'must_have', basis: 'guess' }],
      }).success,
    ).toBe(false);
  });

  it('is the content schema of the success_profile kind, with ids on criteria', () => {
    const content = { ...output, criteria: output.criteria.map((c, i) => ({ id: `c${i}`, ...c })) };
    expect(successProfileContentSchema.safeParse(content).success).toBe(true);
    expect(() => parseArtifactContent('success_profile', content)).not.toThrow();
    expect(() => parseArtifactContent('success_profile', output)).toThrow(); // no ids
  });
});
