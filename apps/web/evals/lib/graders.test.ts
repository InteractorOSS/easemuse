// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import type { ResumeKey } from './dataset';
import {
  gradeBenchmark,
  gradeMatch,
  gradeProfile,
  gradeReason,
  inventedNumbers,
  norm,
  numbersIn,
  rankingAccuracy,
  spread,
} from './graders';

const key = {
  id: 'rs-1',
  target_jd: 'jd-1',
  intended_fit: 'strong',
  bias_pair: null,
  criteria: {
    core_competencies: { level: 'strong', why: '' },
    relevant_experience: { level: 'partial', why: '' },
    industry_functional: { level: 'gap', why: '' },
    career_level_years: { level: 'strong', why: '' },
    location_work_arrangement: { level: 'unknown', why: '' },
    education_certification: { level: 'strong', why: '' },
    compensation_other: { level: 'unknown', why: '' },
  },
  must_haves: [],
  facts: {
    full_name: 'Adaeze Okafor',
    email: 'adaeze.okafor@example.com',
    positions: [
      {
        title: 'Vice President, People',
        employer: 'Harborline Logistics',
        start: '2019-03',
        end: 'present',
        team_size: 16,
      },
      {
        title: 'HR Director',
        employer: 'Quillmark Software',
        start: '2014-01',
        end: '2019-02',
        team_size: null,
      },
    ],
    education: [
      { degree: 'BA', field: 'Psychology', school: 'Seoul National University', year: 2008 },
    ],
    numbers: ['reduced time-to-fill by 23%'],
    work_authorization: null,
    compensation_expectation: null,
  },
} as ResumeKey;

const source =
  'Adaeze Okafor. VP People at Harborline Logistics 2019-present. Led a team of 16 and reduced time-to-fill by 23%.';
const good = {
  fullName: 'Adaeze Okafor',
  email: 'ADAEZE.OKAFOR@example.com',
  careerHistory: [
    { company: 'Harborline Logistics', title: 'Vice President, People', start: '2019-03' },
    { company: 'Quillmark Software', title: 'HR Director', start: '2014' },
  ],
  education: [{ school: 'Seoul National University' }],
  majorAchievements: [{ text: 'Reduced time-to-fill by 23%' }],
  leadershipExperience: 'Led a team of 16',
  teamSize: '16',
};

describe('text helpers', () => {
  it('normalises case, punctuation and spacing', () => {
    expect(norm('  Vice-President, People! ')).toBe('vice president people');
    expect(norm(null)).toBe('');
  });
  it('finds numbers as written', () => {
    expect(numbersIn('Cut 23% of $1,200 across 4 teams in 2024.')).toEqual([
      '23%',
      '$1,200',
      '4',
      '2024',
    ]);
  });
  it('flags numbers the source never states, but not years', () => {
    expect(inventedNumbers('Reduced cost by 40% for 16 people in 2019', source)).toEqual(['40%']);
    expect(inventedNumbers('Reduced time-to-fill by 23%', source)).toEqual([]);
  });
});

describe('gradeProfile', () => {
  it('passes a faithful extraction, whatever the case of the email', () => {
    expect(gradeProfile(good, key, source)).toMatchObject({
      nameCorrect: true,
      emailCorrect: true,
      positionsFound: 1,
      educationFound: 1,
      invented: [],
      pass: true,
    });
  });
  it('fails on an invented number, a wrong employer or a wrong name', () => {
    const invented = gradeProfile(
      { ...good, majorAchievements: [{ text: 'Saved $5M' }] },
      key,
      source,
    );
    expect(invented.invented).toEqual(['$5M']);
    expect(invented.pass).toBe(false);
    const wrongEmployer = gradeProfile(
      {
        ...good,
        careerHistory: [
          { ...good.careerHistory[0]!, company: 'Other Corp' },
          good.careerHistory[1]!,
        ],
      },
      key,
      source,
    );
    expect(wrongEmployer.positionsFound).toBe(0.5);
    expect(wrongEmployer.pass).toBe(false);
    expect(gradeProfile({ ...good, fullName: 'Someone Else' }, key, source).pass).toBe(false);
  });
});

describe('gradeMatch', () => {
  const levels = {
    coreCompetencies: 'strong',
    relevantExperience: 'strong', // one step from partial
    industryFunctional: 'strong', // two steps from gap
    careerLevel: 'strong',
    locationArrangement: 'unknown',
    educationCertification: 'partial', // one step from strong
    compensationOther: 'strong', // unknown in the key, never close
  } as const;
  it('counts exact levels and levels within one step; unknown only matches unknown', () => {
    expect(gradeMatch(levels, key)).toEqual({ exact: 3, withinOne: 5, total: 7 });
  });
});

describe('ranking and spread', () => {
  it('counts the JDs whose strong, partial and weak resumes score in order', () => {
    const scores = new Map([
      ['jd-1', { strong: 90, partial: 70, weak: 30 }],
      ['jd-2', { strong: 70, partial: 70, weak: 30 }],
      ['jd-3', { strong: 80, partial: 60 }], // incomplete: not judged
    ]);
    expect(rankingAccuracy(scores)).toBe(0.5);
    expect(rankingAccuracy(new Map())).toBe(0);
  });
  it('measures the spread of repeated scores', () => {
    expect(spread([78, 81, 80])).toBe(3);
    expect(spread([])).toBe(0);
  });
});

describe('gradeReason', () => {
  const context = {
    source: 'HR Director at Northwind. Managed a team of 20.',
    names: ['Minsu', 'Kim'],
  };
  it('accepts one short, grounded, neutral sentence', () => {
    const g = gradeReason('Directs HR at a similar company and managed a team of 20.', context);
    expect(g).toMatchObject({ pass: true, leaksIdentity: false, gendered: [], invented: [] });
  });
  it('fails a name, a contact detail, a gendered word, an invented number and a long reason', () => {
    expect(gradeReason('Minsu directs HR for a team of 20.', context).leaksIdentity).toBe(true);
    expect(gradeReason('Reach at a.b@example.com about HR work.', context).leaksIdentity).toBe(
      true,
    );
    expect(gradeReason('She directs HR for a team of 20 people.', context).gendered).toEqual([
      'she',
    ]);
    expect(gradeReason('Directs HR for a team of 45 people.', context).invented).toEqual(['45']);
    expect(
      gradeReason(Array.from({ length: 31 }, () => 'word').join(' '), context).withinLength,
    ).toBe(false);
  });
});

describe('gradeBenchmark', () => {
  const research = {
    findings: 'Pay is 120k. [S1]',
    sources: [{ id: 'S1', url: 'https://jobs.example.com/a', citedTexts: ['120k'] }],
  };
  const kept = (text: string, url = 'https://jobs.example.com/a') => ({
    text,
    sources: [{ url, retrievedOn: '2026-10-07' }],
  });
  const grade = (web: ReturnType<typeof kept>[], rawWeb = [{ text: '', sourceIds: ['S1'] }]) =>
    gradeBenchmark({
      raw: { web: rawWeb, suggestions: [{ basedOn: ['W1'] }] },
      research,
      content: { web, suggestions: [], droppedWebItems: 0 },
      isPaid: (u) => u.includes('payscale'),
    });

  it('is clean when every kept item has a cited, free, dated link and states only supported numbers', () => {
    expect(grade([kept('Pay is 120k.')])).toMatchObject({
      allLinked: true,
      anyPaid: false,
      numbersSupported: 1,
      rawCitedRate: 1,
      suggestionsKeptRate: 0,
    });
  });
  it('catches a link the research never cited, a paid source and a number nobody wrote', () => {
    expect(grade([kept('Pay is 120k.', 'https://elsewhere.example.com/')]).allLinked).toBe(false);
    expect(grade([kept('Pay is 120k.', 'https://www.payscale.com/x')]).anyPaid).toBe(true);
    expect(grade([kept('Pay is 190k.')]).numbersSupported).toBe(0);
  });
  it('measures how often the model cited at all, before the code drops anything', () => {
    expect(
      grade(
        [],
        [
          { text: 'a', sourceIds: ['S1'] },
          { text: 'b', sourceIds: [] },
          { text: 'c', sourceIds: ['S9'] },
          { text: 'd', sourceIds: ['S1'] },
        ],
      ).rawCitedRate,
    ).toBe(0.5);
  });
});
