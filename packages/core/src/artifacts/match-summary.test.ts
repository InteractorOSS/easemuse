// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { MATCH_WEIGHT_KEYS } from '../schemas/settings';
import { type CriterionResult, type MatchAnalysisContent } from './match-analysis';
import { summarizeAnalysis } from './match-summary';

const criterion = (
  key: (typeof MATCH_WEIGHT_KEYS)[number],
  level: CriterionResult['level'],
  over: Partial<CriterionResult> = {},
): CriterionResult => ({
  key,
  level,
  score: level === 'strong' ? 90 : level === 'partial' ? 60 : level === 'gap' ? 20 : 50,
  summary: `${key} ${level}`,
  evidence: [],
  toConfirm: [],
  ...over,
});
const categories = new Map([
  ['m1', 'must_have'],
  ['m2', 'must_have'],
  ['d1', 'disqualifying'],
  ['n1', 'nice_to_have'],
]);

describe('summarizeAnalysis', () => {
  const content: MatchAnalysisContent = {
    criteria: [
      criterion('coreCompetencies', 'strong'),
      criterion('relevantExperience', 'strong'),
      criterion('industryFunctional', 'partial'),
      criterion('careerLevel', 'gap', { toConfirm: ['Team size?', 'Scope?'] }),
      criterion('locationArrangement', 'strong'),
      criterion('educationCertification', 'strong'),
      criterion('compensationOther', 'unknown', { toConfirm: ['Pay?'] }),
    ],
    requirements: [
      { criterionId: 'm1', status: 'met', evidence: [] },
      { criterionId: 'm2', status: 'unknown', evidence: [] },
      { criterionId: 'd1', status: 'not_met', evidence: [] },
      { criterionId: 'n1', status: 'met', evidence: [] },
    ],
  };

  it('counts must-have and deal-breaker statuses, ignoring other categories', () => {
    expect(summarizeAnalysis(content, categories).requirements).toEqual({
      mustHave: { met: 1, not_met: 0, unknown: 1 },
      disqualifying: { met: 0, not_met: 1, unknown: 0 },
    });
  });

  it('keeps the top three strengths and the gaps, real gaps before partial matches', () => {
    const s = summarizeAnalysis(content, categories);
    expect(s.strengths.map((x) => x.key)).toEqual([
      'coreCompetencies',
      'relevantExperience',
      'locationArrangement',
    ]);
    expect(s.gaps.map((x) => [x.key, x.level])).toEqual([
      ['careerLevel', 'gap'],
      ['industryFunctional', 'partial'],
    ]);
  });

  it('counts what is still to confirm', () => {
    expect(summarizeAnalysis(content, categories).toConfirmCount).toBe(3);
  });

  it('ignores a requirement whose criterion is no longer in the success profile', () => {
    const s = summarizeAnalysis(
      { ...content, requirements: [{ criterionId: 'gone', status: 'met', evidence: [] }] },
      categories,
    );
    expect(s.requirements.mustHave).toEqual({ met: 0, not_met: 0, unknown: 0 });
  });
});
