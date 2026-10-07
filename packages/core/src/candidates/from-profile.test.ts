// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  candidateFieldsFromProfile,
  candidateSearchParts,
  firstYear,
  seniorityFromTitle,
} from './from-profile';

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
      seniority: null,
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

describe('seniorityFromTitle', () => {
  it('reads the level a title names, highest first', () => {
    expect(seniorityFromTitle('Senior HR Director')).toBe('Director');
    expect(seniorityFromTitle('VP of Engineering')).toBe('VP');
    expect(seniorityFromTitle('Chief People Officer')).toBe('C-level');
    expect(seniorityFromTitle('Head of Talent')).toBe('Director');
    expect(seniorityFromTitle('HR Manager')).toBe('Manager');
    expect(seniorityFromTitle('Staff Engineer')).toBe('Lead');
    expect(seniorityFromTitle('Senior Backend Engineer')).toBe('Senior');
    expect(seniorityFromTitle('Junior Analyst')).toBe('Junior');
  });
  it('reads common Korean titles', () => {
    expect(seniorityFromTitle('인사팀 팀장')).toBe('Manager');
    expect(seniorityFromTitle('이사')).toBe('Director');
    expect(seniorityFromTitle('수석 연구원')).toBe('Lead');
    expect(seniorityFromTitle('신입 사원')).toBe('Junior');
  });
  it('is null when the title names no level, or there is no title', () => {
    expect(seniorityFromTitle('Software Engineer')).toBeNull();
    expect(seniorityFromTitle('')).toBeNull();
    expect(seniorityFromTitle(null)).toBeNull();
  });
  it('does not take part of a word for a level', () => {
    expect(seniorityFromTitle('Assistant to the Leadership Team')).toBe('Junior');
    expect(seniorityFromTitle('Seniority Analyst')).toBeNull();
  });
});

describe('candidateSearchParts', () => {
  it('puts name and titles first, skills and employers second, and the rest last', () => {
    const profile = {
      ...base,
      fullName: 'Alex Kim',
      currentPosition: { title: 'HR Director', company: 'Northwind' },
      location: 'Seoul',
      coreSkills: ['payroll'],
      careerHistory: [
        {
          company: 'Northwind',
          title: 'HR Director',
          start: '2019',
          end: null,
          current: true,
          summary: 'Ran benefits',
        },
      ],
      majorAchievements: [{ text: 'Cut cost', evidence: [{ type: 'inferred' as const }] }],
    };
    const fields = candidateFieldsFromProfile(profile, NOW);
    const parts = candidateSearchParts(profile, fields);
    expect(parts.primary).toBe('Alex Kim HR Director HR Director');
    expect(parts.secondary).toContain('payroll');
    expect(parts.secondary).toContain('Northwind');
    expect(parts.rest).toContain('Seoul');
    expect(parts.rest).toContain('Ran benefits');
    expect(parts.rest).toContain('Cut cost');
  });
});
