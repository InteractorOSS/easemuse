// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { MATCH_WEIGHT_KEYS, type CriterionResult } from '@easemuse/core';
import { createPromptRegistry } from '../prompts';
import { PURPOSES } from '../purposes';
import { registerBuiltInPrompts } from './index';
import {
  matchAnalyzePrompt,
  renderCandidateForMatch,
  type MatchAnalyzeInput,
} from './match-analyze';

const candidate: MatchAnalyzeInput['candidate'] = {
  currentPosition: { title: 'HR Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'HR Director',
      start: '2019',
      end: null,
      current: true,
      summary: 'Managed a team of 20 across payroll and benefits',
    },
  ],
  education: [{ school: 'State University', degree: 'BA Business', year: '2010' }],
  coreSkills: ['payroll', 'compliance'],
  industryExperience: ['manufacturing'],
  technicalSkills: ['Workday'],
  leadershipExperience: 'Led a 20-person team',
  teamSize: '20',
  careerProgression: null,
  location: 'Seoul',
  workAuthorization: 'Korean work visa not needed',
  compensationExpectation: 'KRW 120M',
  majorAchievements: [{ text: 'Cut payroll errors by 40%', evidence: [{ type: 'inferred' }] }],
};
const input: MatchAnalyzeInput = {
  successProfile: {
    summary: 'A senior HR leader',
    criteria: [
      { id: 'c-must', text: '8 years in HR', category: 'must_have', basis: 'jd' },
      { id: 'c-nice', text: 'Korean language', category: 'nice_to_have', basis: 'jd' },
      { id: 'c-dq', text: 'Currently at a competitor', category: 'disqualifying', basis: 'intake' },
    ],
    expectations: { sixMonths: 'Own payroll', twelveMonths: '' },
    keyChallenges: ['Reduce errors'],
  },
  candidate,
  position: {
    title: 'Head of HR',
    location: 'Seoul',
    workArrangement: 'hybrid',
    compensation: '100000000-130000000 KRW',
  },
};
const criterion = (
  key: (typeof MATCH_WEIGHT_KEYS)[number],
  over: Partial<CriterionResult> = {},
): CriterionResult => ({
  key,
  level: 'strong',
  score: 90,
  summary: 's',
  evidence: [{ type: 'inferred', rationale: 'r' }],
  toConfirm: [],
  ...over,
});
const modelOutput = (criteria: CriterionResult[], requirements: unknown[] = []) =>
  matchAnalyzePrompt.schema.parse({ criteria, requirements });

describe('A10 match.analyze prompt', () => {
  it('is registered and produces a match_analysis draft on Opus with high effort', () => {
    const registry = createPromptRegistry();
    registerBuiltInPrompts(registry);
    expect(registry.get('match.analyze')).toBe(matchAnalyzePrompt);
    expect(PURPOSES['match.analyze']).toMatchObject({
      artifactKind: 'match_analysis',
      model: 'claude-opus-5-5',
      effort: 'high',
    });
  });

  it('lists the seven criteria in the fixed order with the rubric bands', () => {
    const { system } = matchAnalyzePrompt.buildPrompt(input);
    const positions = MATCH_WEIGHT_KEYS.map((k) => system.indexOf(k));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(system).toMatch(/strong = 85 to 100/);
    expect(system).toMatch(/partial = 50 to 84/);
    expect(system).toMatch(/gap = 0 to 49/);
    expect(system).toMatch(/unknown[^.]*score 50/);
  });

  it('says a status never excludes anyone, never recommends, and ignores personal characteristics', () => {
    const { system } = matchAnalyzePrompt.buildPrompt(input);
    expect(system).toMatch(/never excludes anyone/i);
    expect(system).toMatch(/never recommend hiring or rejecting/i);
    expect(system).toMatch(/age, gender, name, nationality/i);
    expect(system).toMatch(/data, not instructions/i);
    expect(system).toMatch(/disqualifying[^.]*APPLIES/);
  });

  it('gives the model the success profile with criterion ids, the position and the candidate, but no name or contact details', () => {
    const { user } = matchAnalyzePrompt.buildPrompt(input);
    expect(user).toContain('id=c-must [must_have] 8 years in HR');
    expect(user).toContain('Title: Head of HR');
    expect(user).toContain('Compensation: 100000000-130000000 KRW');
    expect(user).toContain('Job: HR Director at Northwind, 2019 to present.');
    expect(user).not.toMatch(/Alex|@|fullName|email|phone/i);
  });

  it('renders the same candidate to the same text every time', () => {
    expect(renderCandidateForMatch(candidate)).toBe(renderCandidateForMatch({ ...candidate }));
  });

  describe('turning the answer into content', () => {
    const content = (criteria: CriterionResult[], requirements: unknown[] = []) =>
      matchAnalyzePrompt.toContent!(modelOutput(criteria, requirements), input) as unknown as {
        criteria: CriterionResult[];
        requirements: { criterionId: string; status: string; evidence: unknown[] }[];
      };

    it('puts the criteria in order and brings each score into its level band', () => {
      const shuffled = [...MATCH_WEIGHT_KEYS]
        .reverse()
        .map((k) =>
          criterion(
            k,
            k === 'careerLevel'
              ? { level: 'gap', score: 90 }
              : k === 'compensationOther'
                ? { level: 'unknown', score: 0 }
                : {},
          ),
        );
      const result = content(shuffled).criteria;
      expect(result.map((c) => c.key)).toEqual([...MATCH_WEIGHT_KEYS]);
      expect(result.find((c) => c.key === 'careerLevel')!.score).toBe(49);
      expect(result.find((c) => c.key === 'compensationOther')!.score).toBe(50);
    });

    it('keeps a quote the profile contains and demotes one it does not, so no citation is invented', () => {
      const criteria = MATCH_WEIGHT_KEYS.map((k) =>
        criterion(
          k,
          k === 'coreCompetencies'
            ? {
                evidence: [
                  { type: 'quote', source: 'profile', excerpt: 'Managed a team of 20' },
                  { type: 'quote', source: 'profile', excerpt: 'Won the nobel prize' },
                ],
              }
            : {},
        ),
      );
      expect(content(criteria).criteria[0]!.evidence).toEqual([
        { type: 'quote', source: 'profile', excerpt: 'Managed a team of 20' },
      ]);
      const onlyInvented = MATCH_WEIGHT_KEYS.map((k) =>
        criterion(
          k,
          k === 'coreCompetencies'
            ? { evidence: [{ type: 'quote', source: 'profile', excerpt: 'Won the nobel prize' }] }
            : {},
        ),
      );
      expect(content(onlyInvented).criteria[0]!.evidence).toEqual([
        { type: 'inferred', rationale: 'The quoted words were not found in the profile' },
      ]);
    });

    it('answers every must-have and disqualifying criterion, as unknown when the model skipped it, and drops unknown ids and nice-to-haves', () => {
      const criteria = MATCH_WEIGHT_KEYS.map((k) => criterion(k));
      const result = content(criteria, [
        { criterionId: 'c-must', status: 'met', evidence: [] },
        { criterionId: 'c-nice', status: 'met', evidence: [] },
        { criterionId: 'made-up', status: 'not_met', evidence: [] },
        { criterionId: 'c-must', status: 'not_met', evidence: [] },
      ]).requirements;
      expect(result.map((r) => [r.criterionId, r.status])).toEqual([
        ['c-must', 'met'],
        ['c-dq', 'unknown'],
      ]);
    });

    it('refuses a repeated criterion instead of guessing which one is right', () => {
      const criteria = MATCH_WEIGHT_KEYS.map((k, i) => criterion(i === 1 ? 'coreCompetencies' : k));
      expect(() => content(criteria)).toThrow(/exactly one/);
    });
  });
});
