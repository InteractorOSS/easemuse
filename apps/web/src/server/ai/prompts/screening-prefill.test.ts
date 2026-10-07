// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { SCREENING_ITEMS, screeningDraftContentSchema } from '@easemuse/core';
import { screeningPrefillPrompt, type ScreeningPrefillInput } from './screening-prefill';

const input: ScreeningPrefillInput = {
  position: { title: 'Head of HR', location: 'Seoul' },
  profile: {
    currentPosition: { title: 'HR Director', company: 'Northwind' },
    careerHistory: [
      {
        company: 'Northwind',
        title: 'HR Director',
        start: '2019',
        end: null,
        current: true,
        summary: 'Managed 20',
      },
    ],
    education: [],
    coreSkills: ['Payroll'],
    technicalSkills: [],
    industryExperience: [],
    leadershipExperience: null,
    teamSize: '20',
    careerProgression: null,
    majorAchievements: [],
    location: 'Seoul',
    workAuthorization: null,
    compensationExpectation: null,
  },
};

describe('screening suggestions prompt (A11)', () => {
  it('asks about all 14 items and tells the model to leave out what the profile does not say', () => {
    const { system, user } = screeningPrefillPrompt.buildPrompt(input);
    for (const item of SCREENING_ITEMS) expect(system).toContain(`- ${item}:`);
    expect(system).toContain('rating is null');
    expect(user).toContain('Head of HR');
    expect(user).toContain('HR Director at Northwind');
  });

  it('accepts a suggestion for every item and rejects a missing one', () => {
    const empty = Object.fromEntries(SCREENING_ITEMS.map((k) => [k, { rating: null, note: '' }]));
    expect(screeningDraftContentSchema.safeParse({ items: empty }).success).toBe(true);
    const { careerMotivation: _dropped, ...rest } = empty;
    void _dropped;
    expect(screeningDraftContentSchema.safeParse({ items: rest }).success).toBe(false);
    expect(
      screeningDraftContentSchema.safeParse({
        items: { ...empty, jobChanges: { rating: 'great', note: '' } },
      }).success,
    ).toBe(false);
  });
});
