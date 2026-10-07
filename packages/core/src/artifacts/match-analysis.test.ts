// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { DEFAULT_MATCH_WEIGHTS, MATCH_WEIGHT_KEYS } from '../schemas/settings';
import {
  LEVEL_BANDS,
  computeOverall,
  criterionScoresOf,
  effectiveScore,
  matchAnalysisModelOutputSchema,
  normalizeCriteria,
  parseArtifactContent,
  scoreForLevel,
  strengthsAndGaps,
  type CriterionOverride,
  type CriterionResult,
} from '..';

const criterion = (
  key: (typeof MATCH_WEIGHT_KEYS)[number],
  level: CriterionResult['level'],
  score: number,
  over: Partial<CriterionResult> = {},
): CriterionResult => ({
  key,
  level,
  score,
  summary: `${key} summary`,
  evidence: [{ type: 'inferred', rationale: 'x' }],
  toConfirm: [],
  ...over,
});
const all = (level: CriterionResult['level'], score: number) =>
  MATCH_WEIGHT_KEYS.map((k) => criterion(k, level, score));

describe('scoreForLevel', () => {
  it('keeps a score inside its level band', () => {
    expect(scoreForLevel('strong', 70)).toBe(85);
    expect(scoreForLevel('strong', 97)).toBe(97);
    expect(scoreForLevel('partial', 95)).toBe(84);
    expect(scoreForLevel('partial', 20)).toBe(50);
    expect(scoreForLevel('gap', 80)).toBe(49);
    expect(scoreForLevel('gap', 10)).toBe(10);
  });
  it('makes unknown neutral whatever the model said', () => {
    expect(scoreForLevel('unknown', 0)).toBe(50);
    expect(scoreForLevel('unknown', 100)).toBe(50);
  });
  it('rounds, and survives a non-number', () => {
    expect(scoreForLevel('partial', 60.6)).toBe(61);
    expect(scoreForLevel('gap', Number.NaN)).toBe(0);
  });
  it('has bands that do not overlap and cover 0 to 100', () => {
    expect(LEVEL_BANDS.gap.max + 1).toBe(LEVEL_BANDS.partial.min);
    expect(LEVEL_BANDS.partial.max + 1).toBe(LEVEL_BANDS.strong.min);
    expect(LEVEL_BANDS.strong.max).toBe(100);
  });
});

describe('normalizeCriteria', () => {
  it('returns the criteria in the fixed order with scores in their bands', () => {
    const shuffled = [...all('partial', 70)]
      .reverse()
      .map((c, i) => (i === 0 ? { ...c, level: 'strong' as const, score: 40 } : c));
    const result = normalizeCriteria(shuffled);
    expect(result.map((c) => c.key)).toEqual([...MATCH_WEIGHT_KEYS]);
    expect(result.find((c) => c.level === 'strong')!.score).toBe(85);
  });
  it('refuses a missing or repeated criterion instead of guessing', () => {
    expect(() => normalizeCriteria(all('strong', 90).slice(1))).toThrow(/exactly one/);
    expect(() =>
      normalizeCriteria([
        ...all('strong', 90).slice(1),
        criterion('coreCompetencies', 'gap', 10),
        criterion('coreCompetencies', 'gap', 10),
      ]),
    ).toThrow(/coreCompetencies/);
  });
});

describe('computeOverall', () => {
  const scores = criterionScoresOf(all('strong', 90));
  it('is the weighted sum divided by 100, rounded', () => {
    expect(computeOverall(DEFAULT_MATCH_WEIGHTS, scores)).toBe(90);
    const mixed = criterionScoresOf([
      criterion('coreCompetencies', 'strong', 90),
      criterion('relevantExperience', 'strong', 80),
      criterion('industryFunctional', 'partial', 60),
      criterion('careerLevel', 'partial', 70),
      criterion('locationArrangement', 'gap', 20),
      criterion('educationCertification', 'strong', 100),
      criterion('compensationOther', 'unknown', 50),
    ]);
    // 40*90 + 20*80 + 15*60 + 10*70 + 5*20 + 5*100 + 5*50 = 3600+1600+900+700+100+500+250 = 7650
    expect(computeOverall(DEFAULT_MATCH_WEIGHTS, mixed)).toBe(77); // 76.5 rounds up
  });
  it('changes with the weights, with no new analysis', () => {
    const mixed = criterionScoresOf([
      criterion('coreCompetencies', 'strong', 90),
      criterion('relevantExperience', 'strong', 80),
      criterion('industryFunctional', 'partial', 60),
      criterion('careerLevel', 'partial', 70),
      criterion('locationArrangement', 'gap', 20),
      criterion('educationCertification', 'strong', 100),
      criterion('compensationOther', 'unknown', 50),
    ]);
    const locationHeavy = {
      ...DEFAULT_MATCH_WEIGHTS,
      coreCompetencies: 20,
      locationArrangement: 25,
    };
    expect(computeOverall(locationHeavy, mixed)).toBeLessThan(
      computeOverall(DEFAULT_MATCH_WEIGHTS, mixed),
    );
  });
  it('uses a recruiter override in place of the computed score for that criterion, keeping both', () => {
    const override: CriterionOverride = {
      key: 'coreCompetencies',
      original: 90,
      score: 50,
      reason: 'Interview showed less depth',
      byId: 'u1',
      at: '2026-10-07T00:00:00Z',
    };
    expect(effectiveScore(scores, [override], 'coreCompetencies')).toBe(50);
    expect(effectiveScore(scores, [override], 'careerLevel')).toBe(90);
    // 40*50 + 60*90 = 2000 + 5400 = 7400 -> 74
    expect(computeOverall(DEFAULT_MATCH_WEIGHTS, scores, [override])).toBe(74);
    expect(scores.coreCompetencies.score).toBe(90);
  });
  it('is 0 for an all-gap candidate and 100 for a perfect one', () => {
    expect(computeOverall(DEFAULT_MATCH_WEIGHTS, criterionScoresOf(all('gap', 0)))).toBe(0);
    expect(computeOverall(DEFAULT_MATCH_WEIGHTS, criterionScoresOf(all('strong', 100)))).toBe(100);
  });
});

describe('strengthsAndGaps', () => {
  it('takes strengths and gaps from the criteria and lists what to confirm', () => {
    const criteria = [
      criterion('coreCompetencies', 'strong', 90),
      criterion('relevantExperience', 'partial', 60, { toConfirm: ['Ask about US payroll'] }),
      criterion('industryFunctional', 'gap', 20),
      criterion('careerLevel', 'unknown', 50, { toConfirm: ['Team size?'] }),
      criterion('locationArrangement', 'strong', 90),
      criterion('educationCertification', 'unknown', 50),
      criterion('compensationOther', 'unknown', 50, { toConfirm: ['Pay expectation'] }),
    ];
    const result = strengthsAndGaps(criteria);
    expect(result.strengths.map((c) => c.key)).toEqual(['coreCompetencies', 'locationArrangement']);
    expect(result.gaps.map((c) => c.key)).toEqual(['relevantExperience', 'industryFunctional']);
    expect(result.toConfirm.map((t) => t.text)).toEqual([
      'Ask about US payroll',
      'Team size?',
      'Pay expectation',
    ]);
  });
});

describe('model output and the artifact kind', () => {
  it('needs exactly seven criteria, at most three evidence items each, and valid levels', () => {
    const ok = {
      criteria: all('strong', 90),
      requirements: [{ criterionId: 'c1', status: 'met', evidence: [] }],
    };
    expect(matchAnalysisModelOutputSchema.safeParse(ok).success).toBe(true);
    expect(
      matchAnalysisModelOutputSchema.safeParse({ ...ok, criteria: all('strong', 90).slice(1) })
        .success,
    ).toBe(false);
    const tooMuch = all('strong', 90).map((c, i) =>
      i === 0 ? { ...c, evidence: Array(4).fill({ type: 'inferred' }) } : c,
    );
    expect(matchAnalysisModelOutputSchema.safeParse({ ...ok, criteria: tooMuch }).success).toBe(
      false,
    );
    expect(
      matchAnalysisModelOutputSchema.safeParse({ ...ok, criteria: all('excellent' as never, 90) })
        .success,
    ).toBe(false);
    expect(
      matchAnalysisModelOutputSchema.safeParse({
        ...ok,
        requirements: [{ criterionId: 'c1', status: 'maybe', evidence: [] }],
      }).success,
    ).toBe(false);
  });
  it('is the content schema of the match_analysis kind', () => {
    expect(() =>
      parseArtifactContent('match_analysis', { criteria: all('strong', 90), requirements: [] }),
    ).not.toThrow();
    expect(() => parseArtifactContent('match_analysis', { a: 1 })).toThrow();
  });
});
