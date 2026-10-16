// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import type { PositionProgress } from '@/server/positions/progress';
import { nextAction, processSteps } from './position-progress';

const progress = (
  over: Partial<Omit<PositionProgress, 'counts'>> = {},
  counts: Partial<PositionProgress['counts']> = {},
): PositionProgress => ({
  jd: 'approved',
  successProfile: 'confirmed',
  pendingDrafts: 0,
  ...over,
  counts: {
    pipeline: 0,
    analyzed: 0,
    toAnalyze: 0,
    contacted: 0,
    interested: 0,
    submitted: 0,
    ...counts,
  },
});
const states = (p: PositionProgress) => processSteps(p).map((s) => s.state);

describe('processSteps (G#10)', () => {
  it('starts at the job description', () => {
    expect(states(progress({ jd: 'none', successProfile: 'none' }))).toEqual([
      'current',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
      'waiting',
    ]);
  });

  it('marks the first step that is not done as current', () => {
    expect(states(progress({}, { pipeline: 5, analyzed: 3 }))).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
      'waiting',
    ]);
  });

  it('keeps later progress visible even when an earlier step is open', () => {
    expect(states(progress({ successProfile: 'draft' }, { pipeline: 2 }))).toEqual([
      'done',
      'current',
      'done',
      'waiting',
      'waiting',
      'waiting',
    ]);
  });
});

describe('nextAction', () => {
  it('follows the order of the search', () => {
    expect(nextAction(progress({ jd: 'none' })).key).toBe('addJd');
    expect(nextAction(progress({ jd: 'in_progress' }))).toEqual({
      key: 'approveJd',
      count: 0,
      page: 'structure',
    });
    expect(nextAction(progress({ successProfile: 'draft' })).page).toBe('profile');
    expect(nextAction(progress({ pendingDrafts: 3 }))).toEqual({
      key: 'reviewDrafts',
      count: 3,
      page: 'candidates',
    });
    expect(nextAction(progress()).key).toBe('addCandidates');
    expect(nextAction(progress({}, { pipeline: 5, analyzed: 2, toAnalyze: 3 }))).toEqual({
      key: 'analyze',
      count: 3,
      page: 'candidates',
    });
    expect(nextAction(progress({}, { pipeline: 5, analyzed: 5 })).key).toBe('outreach');
    // Candidates who are out of the search (a final state) are never suggested for analysis.
    expect(nextAction(progress({}, { pipeline: 5, analyzed: 2, toAnalyze: 0 })).key).toBe(
      'outreach',
    );
    expect(nextAction(progress({}, { pipeline: 5, analyzed: 5, contacted: 1 })).key).toBe('board');
  });
});
