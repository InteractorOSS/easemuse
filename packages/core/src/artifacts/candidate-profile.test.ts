// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { candidateProfileContentSchema, parseArtifactContent } from '..';

const empty = {
  fullName: null,
  email: null,
  phone: null,
  currentPosition: { title: null, company: null },
  careerHistory: [],
  education: [],
  coreSkills: [],
  industryExperience: [],
  technicalSkills: [],
  leadershipExperience: null,
  teamSize: null,
  careerProgression: null,
  location: null,
  workAuthorization: null,
  compensationExpectation: null,
  majorAchievements: [],
  potentialMotivation: null,
  potentialConcerns: [],
};

describe('candidate profile', () => {
  it('accepts a profile where nothing was found: every field empty, nothing guessed', () => {
    expect(candidateProfileContentSchema.safeParse(empty).success).toBe(true);
  });

  it('requires every field to be present, so a gap is stated rather than left out', () => {
    const { location, ...rest } = empty;
    void location;
    expect(candidateProfileContentSchema.safeParse(rest).success).toBe(false);
  });

  it('needs evidence on achievements and on the potential fields', () => {
    expect(
      candidateProfileContentSchema.safeParse({
        ...empty,
        majorAchievements: [{ text: 'Cut costs 30%', evidence: [] }],
      }).success,
    ).toBe(false);
    expect(
      candidateProfileContentSchema.safeParse({
        ...empty,
        potentialConcerns: [
          {
            text: 'Short roles',
            evidence: [{ type: 'inferred', rationale: 'Three roles under a year' }],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('is the content schema of the candidate_profile kind', () => {
    expect(() => parseArtifactContent('candidate_profile', empty)).not.toThrow();
    expect(() => parseArtifactContent('candidate_profile', { a: 1 })).toThrow();
  });
});
