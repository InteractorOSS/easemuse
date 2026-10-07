// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ArtifactKind } from '@easemuse/core';

/**
 * The routing table (ADR-005): which model and effort each AI purpose uses. It is configuration:
 * changing a model or effort does not touch feature code. Sonnet handles high-volume extraction;
 * Opus handles output that reaches clients or candidates or drives a decision. Effort is always set
 * explicitly because the defaults differ per model.
 */
export type Effort = 'low' | 'medium' | 'high';

export interface PurposeSpec {
  /** Capability id from the planning handoff (A1..A18, X1). */
  code: string;
  model: 'claude-opus-5-5' | 'claude-sonnet-5-5';
  effort: Effort;
  /** The artifact kind the output becomes a draft of; null when the output is not a draft. */
  artifactKind: ArtifactKind | null;
  /** Output ceiling for one call. */
  maxTokens: number;
}

export const PURPOSES = {
  'jd.structure': {
    code: 'A1',
    model: 'claude-opus-5-5',
    effort: 'medium',
    artifactKind: 'structured_jd',
    maxTokens: 16_000,
  },
  'intake.questions': {
    code: 'A2',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'intake_questions',
    maxTokens: 8_000,
  },
  'market.benchmark': {
    code: 'A3',
    model: 'claude-opus-5-5',
    effort: 'high',
    artifactKind: 'benchmark_report',
    maxTokens: 16_000,
  },
  'jd.improve': {
    code: 'A4',
    model: 'claude-opus-5-5',
    effort: 'medium',
    artifactKind: 'improved_jd',
    maxTokens: 16_000,
  },
  'success_profile.create': {
    code: 'A5',
    model: 'claude-opus-5-5',
    effort: 'medium',
    artifactKind: 'success_profile',
    maxTokens: 16_000,
  },
  'search_criteria.create': {
    code: 'A6',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'search_criteria',
    maxTokens: 8_000,
  },
  'profile.structure': {
    code: 'A7',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'candidate_profile',
    maxTokens: 12_000,
  },
  'pool.similar': {
    code: 'A8',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'similar_candidates',
    maxTokens: 8_000,
  },
  'portfolio.check': {
    code: 'A9',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'portfolio_fit',
    maxTokens: 8_000,
  },
  'match.analyze': {
    code: 'A10',
    model: 'claude-opus-5-5',
    effort: 'high',
    artifactKind: 'match_analysis',
    maxTokens: 16_000,
  },
  'screening.prefill': {
    code: 'A11',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'screening_draft',
    maxTokens: 8_000,
  },
  'outreach.draft': {
    code: 'A12',
    model: 'claude-opus-5-5',
    effort: 'medium',
    artifactKind: 'outreach_message',
    maxTokens: 6_000,
  },
  'call.questions': {
    code: 'A13',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'call_questions',
    maxTokens: 8_000,
  },
  'notes.qualify': {
    code: 'A14',
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    artifactKind: 'qualification',
    maxTokens: 12_000,
  },
  'resume.tailor': {
    code: 'A15',
    model: 'claude-opus-5-5',
    effort: 'high',
    artifactKind: 'tailored_resume',
    maxTokens: 16_000,
  },
  'report.draft': {
    code: 'A16',
    model: 'claude-opus-5-5',
    effort: 'high',
    artifactKind: 'submission_report',
    maxTokens: 24_000,
  },
  'feedback.structure': {
    code: 'A17',
    model: 'claude-sonnet-5-5',
    effort: 'low',
    artifactKind: 'interview_feedback',
    maxTokens: 8_000,
  },
  'pattern.summarize': {
    code: 'A18',
    model: 'claude-opus-5-5',
    effort: 'medium',
    artifactKind: 'pattern_summary',
    maxTokens: 16_000,
  },
  // Internal step inside A15/A16: checks generated text against the source (ADR-006).
  'factcheck.verify': {
    code: 'X1',
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    artifactKind: null,
    maxTokens: 8_000,
  },
} as const satisfies Record<string, PurposeSpec>;

export type PurposeId = keyof typeof PURPOSES;

export function isPurposeId(value: string): value is PurposeId {
  return value in PURPOSES;
}

/**
 * The one purpose that may run without a person asking (FR-AI-01): computing embeddings of content a
 * recruiter has just approved. It is indexing, not generation, so it has no model entry here and
 * goes through its own path (T-2-08).
 */
export const AUTOMATIC_PURPOSES = ['embedding.index'] as const;
