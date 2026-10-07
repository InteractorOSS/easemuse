// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { intakeQuestionsContentSchema } from './intake-questions';
import { structuredJdContentSchema } from './structured-jd';

/**
 * Artifact kinds (ADR-006): everything an AI draft can become, one lifecycle for all. Mirrors the
 * Prisma `ArtifactKind` enum; a guard test keeps the two lists equal.
 */
export const ARTIFACT_KINDS = [
  'structured_jd',
  'improved_jd',
  'intake_questions',
  'success_profile',
  'benchmark_report',
  'search_criteria',
  'candidate_profile',
  'match_analysis',
  'screening_draft',
  'outreach_message',
  'call_questions',
  'qualification',
  'tailored_resume',
  'submission_report',
  'interview_feedback',
  'pattern_summary',
  'similar_candidates',
  'portfolio_fit',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** What an artifact is about. There is no database foreign key for it (ADR-006), so services check it. */
export const SUBJECT_TYPES = ['position', 'candidate', 'pipeline_entry', 'interview'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

/** Content of a kind whose feature has not defined its schema yet: any JSON object. */
const anyObject = z.record(z.string(), z.unknown());

export interface ArtifactKindSpec {
  kind: ArtifactKind;
  subjectType: SubjectType;
  /** Validates `ArtifactVersion.content` on every write (AI or human). */
  schema: z.ZodType<Record<string, unknown>>;
  /**
   * Top-level content fields only a person may write (brief §1.1: the recruiter's own judgment).
   * An AI-origin version must leave them empty; approval rejects a version where AI wrote them.
   */
  humanOnlyFields: readonly string[];
  /** Fields that must be non-empty before the version can be approved. */
  requiredOnApprove: readonly string[];
  /** Approval needs every fact-check warning resolved (FR-AI-06). */
  factCheckRequired: boolean;
  /**
   * True while the kind still uses the permissive placeholder schema; the feature task that owns
   * the kind (see docs/planning/tasks.md) replaces it with the real one.
   */
  placeholderSchema: boolean;
}

function spec(
  kind: ArtifactKind,
  subjectType: SubjectType,
  options: Partial<Omit<ArtifactKindSpec, 'kind' | 'subjectType'>> = {},
): ArtifactKindSpec {
  return {
    kind,
    subjectType,
    schema: options.schema ?? anyObject,
    humanOnlyFields: options.humanOnlyFields ?? [],
    requiredOnApprove: options.requiredOnApprove ?? [],
    factCheckRequired: options.factCheckRequired ?? false,
    placeholderSchema: options.schema === undefined,
  };
}

export const ARTIFACT_KIND_SPECS: Record<ArtifactKind, ArtifactKindSpec> = {
  structured_jd: spec('structured_jd', 'position', {
    schema: structuredJdContentSchema as z.ZodType<Record<string, unknown>>,
  }),
  improved_jd: spec('improved_jd', 'position'),
  intake_questions: spec('intake_questions', 'position', {
    schema: intakeQuestionsContentSchema as z.ZodType<Record<string, unknown>>,
  }),
  success_profile: spec('success_profile', 'position'),
  benchmark_report: spec('benchmark_report', 'position'),
  search_criteria: spec('search_criteria', 'position'),
  candidate_profile: spec('candidate_profile', 'candidate'),
  // The recruiter's assessment is theirs alone (FR-MAT-05); only reviewed analyses feed later steps.
  match_analysis: spec('match_analysis', 'pipeline_entry', {
    humanOnlyFields: ['recruiterAssessment'],
  }),
  screening_draft: spec('screening_draft', 'pipeline_entry'),
  outreach_message: spec('outreach_message', 'pipeline_entry'),
  call_questions: spec('call_questions', 'pipeline_entry'),
  qualification: spec('qualification', 'pipeline_entry'),
  // Generated documents are fact-checked; the tailored resume must not change facts (§9.1).
  tailored_resume: spec('tailored_resume', 'pipeline_entry', { factCheckRequired: true }),
  // Section 14, the recruiter's assessment, is human-only and mandatory (§10, ADR-006).
  submission_report: spec('submission_report', 'pipeline_entry', {
    humanOnlyFields: ['recruiterAssessment'],
    requiredOnApprove: ['recruiterAssessment'],
    factCheckRequired: true,
  }),
  interview_feedback: spec('interview_feedback', 'interview'),
  pattern_summary: spec('pattern_summary', 'position'),
  similar_candidates: spec('similar_candidates', 'position'),
  portfolio_fit: spec('portfolio_fit', 'candidate'),
};

export function isArtifactKind(value: unknown): value is ArtifactKind {
  return typeof value === 'string' && (ARTIFACT_KINDS as readonly string[]).includes(value);
}

/** Validates content against the kind's schema; throws a ZodError on failure. */
export function parseArtifactContent(
  kind: ArtifactKind,
  content: unknown,
): Record<string, unknown> {
  return ARTIFACT_KIND_SPECS[kind].schema.parse(content);
}

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

/** Human-only fields that hold content. */
export function filledHumanOnlyFields(
  kind: ArtifactKind,
  content: Record<string, unknown>,
): string[] {
  return ARTIFACT_KIND_SPECS[kind].humanOnlyFields.filter((field) => !isEmpty(content[field]));
}

/** Required-on-approve fields that are still empty. */
export function missingRequiredFields(
  kind: ArtifactKind,
  content: Record<string, unknown>,
): string[] {
  return ARTIFACT_KIND_SPECS[kind].requiredOnApprove.filter((field) => isEmpty(content[field]));
}
