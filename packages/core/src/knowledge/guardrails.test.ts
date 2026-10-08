// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_BANDS,
  MIN_SAMPLE,
  PATTERN_DIMENSIONS,
  experienceBand,
  isSmallSample,
  mentionsProtected,
} from './guardrails';

describe('mentionsProtected', () => {
  it.each([
    'candidates under 30 were too young for the team',
    'He seemed too old',
    'older candidates did worse',
    'female candidates advanced less often',
    'more men than women were hired',
    'mothers with young children',
    'married candidates',
    'candidates who are pregnant',
    'Asian candidates',
    'Hispanic or Latino',
    'foreign accent',
    'Muslim and Christian candidates',
    'a candidate with a disability',
    'wheelchair access',
    'LGBT candidates',
    'by nationality',
    '34 years old',
    '여성 지원자가 많다',
    '나이가 많은 후보',
    '기혼 후보자',
    '국적별 분석',
  ])('flags %s', (text) => {
    expect(mentionsProtected(text)).toBe(true);
  });

  it.each([
    'Senior',
    'Director',
    '6-10 years',
    '11+ years',
    'TypeScript',
    'Python 3',
    'Kubernetes',
    'Not stated',
    'referral',
    'linkedin',
    'Team too small for the scope',
    'Compensation expectation too high',
    'Skills gap in data engineering',
    'Stage gate review',
    'Single sign-on',
    'Technical fit rated strong in 6 of 8 interviews',
    'candidates with a manager title advanced more often',
    'hold',
  ])('lets %s through', (text) => {
    expect(mentionsProtected(text)).toBe(false);
  });
});

describe('sample size', () => {
  it('flags fewer than the threshold', () => {
    expect(isSmallSample(MIN_SAMPLE - 1)).toBe(true);
    expect(isSmallSample(MIN_SAMPLE)).toBe(false);
    expect(isSmallSample(0)).toBe(true);
  });
});

describe('dimensions', () => {
  it('lists only job-related ones, none of which is itself protected', () => {
    expect([...PATTERN_DIMENSIONS]).toEqual(['seniority', 'experience', 'skill', 'source']);
    for (const d of PATTERN_DIMENSIONS) expect(mentionsProtected(d)).toBe(false);
  });

  it('groups experience in wide steps and says nothing when unknown', () => {
    expect(experienceBand(0)).toBe(EXPERIENCE_BANDS[0]);
    expect(experienceBand(2)).toBe(EXPERIENCE_BANDS[0]);
    expect(experienceBand(3)).toBe(EXPERIENCE_BANDS[1]);
    expect(experienceBand(5)).toBe(EXPERIENCE_BANDS[1]);
    expect(experienceBand(6)).toBe(EXPERIENCE_BANDS[2]);
    expect(experienceBand(10)).toBe(EXPERIENCE_BANDS[2]);
    expect(experienceBand(11)).toBe(EXPERIENCE_BANDS[3]);
    expect(experienceBand(40)).toBe(EXPERIENCE_BANDS[3]);
    expect(experienceBand(null)).toBeNull();
    expect(experienceBand(-1)).toBeNull();
  });
});
