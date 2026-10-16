// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { PositionProgress } from '@/server/positions/progress';

/** The six steps of a search on the position page, in the brief's order (section 2). */
export const PROCESS_STEPS = [
  'jd',
  'profile',
  'sourcing',
  'matching',
  'outreach',
  'submission',
] as const;
export type ProcessStep = (typeof PROCESS_STEPS)[number];
export type StepState = 'done' | 'current' | 'waiting';

function isDone(step: ProcessStep, p: PositionProgress): boolean {
  switch (step) {
    case 'jd':
      return p.jd === 'approved';
    case 'profile':
      return p.successProfile === 'confirmed';
    case 'sourcing':
      return p.counts.pipeline > 0;
    case 'matching':
      return p.counts.analyzed > 0;
    case 'outreach':
      return p.counts.contacted > 0;
    case 'submission':
      return p.counts.submitted > 0;
  }
}

/** Each step done, current (the first one not done) or waiting. */
export function processSteps(p: PositionProgress): { step: ProcessStep; state: StepState }[] {
  const firstOpen = PROCESS_STEPS.findIndex((s) => !isDone(s, p));
  return PROCESS_STEPS.map((step, i) => ({
    step,
    state: isDone(step, p) ? 'done' : i === firstOpen ? 'current' : 'waiting',
  }));
}

export type NextActionKey =
  | 'addJd'
  | 'approveJd'
  | 'confirmProfile'
  | 'reviewDrafts'
  | 'addCandidates'
  | 'analyze'
  | 'outreach'
  | 'board';

/**
 * The one suggestion for the "next" card, worked out by fixed rules from the counts: a pointer for
 * the recruiter, never something that runs by itself (brief 1.1). `page` is the position's sub-page
 * to open, or null for a section of the position page itself.
 */
export function nextAction(p: PositionProgress): {
  key: NextActionKey;
  count: number;
  page: 'structure' | 'profile' | 'candidates' | null;
} {
  const { counts } = p;
  if (p.jd === 'none') return { key: 'addJd', count: 0, page: null };
  if (p.jd === 'in_progress') return { key: 'approveJd', count: 0, page: 'structure' };
  if (p.successProfile !== 'confirmed') return { key: 'confirmProfile', count: 0, page: 'profile' };
  if (p.pendingDrafts > 0) {
    return { key: 'reviewDrafts', count: p.pendingDrafts, page: 'candidates' };
  }
  if (counts.pipeline === 0) return { key: 'addCandidates', count: 0, page: 'candidates' };
  if (counts.toAnalyze > 0) {
    return { key: 'analyze', count: counts.toAnalyze, page: 'candidates' };
  }
  if (counts.contacted === 0) return { key: 'outreach', count: 0, page: 'candidates' };
  return { key: 'board', count: 0, page: 'candidates' };
}
