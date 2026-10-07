// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { MatchWeightKey } from '../schemas/settings';
import {
  strengthsAndGaps,
  type MatchAnalysisContent,
  type RequirementStatus,
} from './match-analysis';

/** What the review dashboard shows for one analysis, without opening the artifact (T-3-07). */
export interface MatchSummary {
  requirements: {
    mustHave: Record<RequirementStatus, number>;
    /** For a deal-breaker, `met` means the condition applies to the candidate. */
    disqualifying: Record<RequirementStatus, number>;
  };
  strengths: { key: MatchWeightKey; summary: string }[];
  gaps: { key: MatchWeightKey; summary: string; level: 'partial' | 'gap' }[];
  toConfirmCount: number;
}

const TOP = 3;
const zero = (): Record<RequirementStatus, number> => ({ met: 0, not_met: 0, unknown: 0 });

/**
 * Condenses an analysis for the dashboard. `categories` says which success-profile criteria are
 * must-haves or deal-breakers (the analysis content only carries their ids).
 */
export function summarizeAnalysis(
  content: MatchAnalysisContent,
  categories: ReadonlyMap<string, string>,
): MatchSummary {
  const requirements = { mustHave: zero(), disqualifying: zero() };
  for (const r of content.requirements) {
    const category = categories.get(r.criterionId);
    if (category === 'must_have') requirements.mustHave[r.status]++;
    else if (category === 'disqualifying') requirements.disqualifying[r.status]++;
  }
  const { strengths, gaps, toConfirm } = strengthsAndGaps(content.criteria);
  return {
    requirements,
    strengths: strengths.slice(0, TOP).map((c) => ({ key: c.key, summary: c.summary })),
    // Real gaps before partial matches, then the order of the criteria.
    gaps: [...gaps]
      .sort((a, b) => Number(b.level === 'gap') - Number(a.level === 'gap'))
      .slice(0, TOP)
      .map((c) => ({ key: c.key, summary: c.summary, level: c.level as 'partial' | 'gap' })),
    toConfirmCount: toConfirm.length,
  };
}
