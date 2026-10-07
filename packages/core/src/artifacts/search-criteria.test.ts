// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { SEARCH_LIST_FIELDS, parseArtifactContent, searchCriteriaSchema } from '..';

const empty = {
  jobTitles: [],
  skills: [],
  industries: [],
  companies: [],
  geography: [],
  education: [],
  seniority: [],
  leadershipExperience: [],
  yearsOfExperience: { min: null, max: null },
  keywordSearch: '',
};

describe('search criteria', () => {
  it('has a list for each condition of the brief (title, skills, industry, company, geography, education, seniority, leadership) plus years', () => {
    expect(SEARCH_LIST_FIELDS).toHaveLength(8);
    expect(searchCriteriaSchema.safeParse(empty).success).toBe(true);
  });
  it('allows unknown years as null and rejects negative or absurd years', () => {
    expect(
      searchCriteriaSchema.safeParse({ ...empty, yearsOfExperience: { min: 5, max: null } })
        .success,
    ).toBe(true);
    expect(
      searchCriteriaSchema.safeParse({ ...empty, yearsOfExperience: { min: -1, max: null } })
        .success,
    ).toBe(false);
    expect(
      searchCriteriaSchema.safeParse({ ...empty, yearsOfExperience: { min: 5, max: 99 } }).success,
    ).toBe(false);
  });
  it('is the content schema of the search_criteria kind', () => {
    expect(() => parseArtifactContent('search_criteria', empty)).not.toThrow();
    expect(() => parseArtifactContent('search_criteria', { a: 1 })).toThrow();
  });
});
