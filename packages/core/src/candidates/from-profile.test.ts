// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { candidateFieldsFromProfile, firstYear } from './from-profile';

const base = {
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
const NOW = new Date('2026-10-07T00:00:00Z');

describe('firstYear', () => {
  it('finds a four-digit year in the usual formats', () => {
    expect(firstYear('2019')).toBe(2019);
    expect(firstYear('03/2019')).toBe(2019);
    expect(firstYear('Mar 2019')).toBe(2019);
    expect(firstYear('2019-03')).toBe(2019);
  });
  it('is null when there is none', () => {
    expect(firstYear('present')).toBeNull();
    expect(firstYear(null)).toBeNull();
    expect(firstYear('12')).toBeNull();
  });
});

describe('candidateFieldsFromProfile', () => {
  it('leaves everything empty for an empty profile: nothing is guessed', () => {
    expect(candidateFieldsFromProfile(base, NOW)).toEqual({
      fullName: null,
      email: null,
      phone: null,
      currentTitle: null,
      location: null,
      skills: [],
      yearsExperience: null,
      employers: [],
    });
  });

  it('counts years from the earliest stated start year', () => {
    const profile = {
      ...base,
      careerHistory: [
        { company: 'A', title: 't', start: '2019', end: null, current: true, summary: '' },
        { company: 'B', title: 't', start: 'Mar 2014', end: '2019', current: false, summary: '' },
        { company: 'C', title: 't', start: null, end: null, current: false, summary: '' },
      ],
    };
    expect(candidateFieldsFromProfile(profile, NOW).yearsExperience).toBe(12);
  });

  it('merges core and technical skills without duplicates, and lists employers with the current one first', () => {
    const fields = candidateFieldsFromProfile(
      {
        ...base,
        coreSkills: ['payroll', ' compliance '],
        technicalSkills: ['payroll', 'Workday', ''],
        currentPosition: { title: ' Director ', company: 'Northwind' },
        careerHistory: [
          {
            company: 'Contoso',
            title: 'x',
            start: '2010',
            end: '2014',
            current: false,
            summary: '',
          },
        ],
      },
      NOW,
    );
    expect(fields.skills).toEqual(['payroll', 'compliance', 'Workday']);
    expect(fields.currentTitle).toBe('Director');
    expect(fields.employers).toEqual(['Northwind', 'Contoso']);
  });
});
