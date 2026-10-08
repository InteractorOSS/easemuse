// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import type { CandidateProfileContent } from '../artifacts/candidate-profile';
import {
  candidateEmbeddingText,
  identityTokens,
  scrubIdentity,
  successProfileEmbeddingText,
} from './embedding-text';

const profile: CandidateProfileContent = {
  fullName: 'Minsu Kim',
  email: 'minsu.kim@example.com',
  phone: '+82 10-1234-5678',
  currentPosition: { title: 'HR Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'HR Director',
      start: '2019',
      end: null,
      current: true,
      summary:
        'Minsu led a team of 20. Reach me at minsu.kim@example.com or https://linkedin.com/in/minsukim.',
    },
  ],
  education: [{ school: 'Seoul National University', degree: 'BA', year: '2008' }],
  coreSkills: ['payroll', 'talent acquisition'],
  industryExperience: ['retail'],
  technicalSkills: [],
  leadershipExperience: 'Called 010-9999-8888 daily',
  teamSize: '20',
  careerProgression: null,
  location: 'Seoul',
  workAuthorization: null,
  compensationExpectation: '90M KRW',
  majorAchievements: [],
  potentialMotivation: { text: 'Wants growth', evidence: [{ type: 'inferred' }] } as never,
  potentialConcerns: [],
};

describe('candidate text for embedding', () => {
  const text = candidateEmbeddingText(profile);

  it('keeps what says something about fit', () => {
    expect(text).toContain('HR Director at Northwind');
    expect(text).toContain('Core skills: payroll, talent acquisition');
    expect(text).toContain('Seoul National University');
    expect(text).toContain('Location: Seoul');
  });

  it('never carries the name, email, phone or a link, not even inside free text', () => {
    for (const secret of [
      'Minsu',
      'Kim',
      'minsu.kim@example.com',
      '1234-5678',
      '9999-8888',
      'linkedin.com',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('leaves out the inferred fields and the compensation expectation', () => {
    expect(text).not.toContain('Wants growth');
    expect(text).not.toContain('90M');
  });
});

describe('scrubIdentity', () => {
  it('keeps date ranges', () => {
    expect(scrubIdentity('Worked 2019-03 - 2021-05 at Acme')).toBe(
      'Worked 2019-03 - 2021-05 at Acme',
    );
  });
  it('cuts whole name words in any case, not parts of other words', () => {
    expect(scrubIdentity('KIM met Kimberly and kim', ['Kim'])).toBe('met Kimberly and');
  });
  it('cuts Hangul names', () => {
    expect(scrubIdentity('김민수 팀장은 10명을 이끌었다', identityTokens('김민수'))).toBe(
      '팀장은 10명을 이끌었다',
    );
  });
});

describe('success profile text', () => {
  it('lists criteria but not the deal-breakers', () => {
    const t = successProfileEmbeddingText(
      {
        summary: 'A senior HR leader',
        criteria: [
          { id: '1', text: '8 years in HR', category: 'must_have', basis: 'jd' },
          { id: '2', text: 'No job hopping', category: 'disqualifying', basis: 'intake' },
        ],
        expectations: { sixMonths: 'Plan', twelveMonths: '' },
        keyChallenges: ['Merger'],
      },
      { title: 'Head of HR', location: 'Seoul' },
    );
    expect(t).toContain('Role: Head of HR (Seoul)');
    expect(t).toContain('must have: 8 years in HR');
    expect(t).not.toContain('job hopping');
    expect(t).toContain('Challenge: Merger');
  });
});
