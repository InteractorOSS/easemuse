// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_KINDS,
  ARTIFACT_KIND_SPECS,
  SUBJECT_TYPES,
  filledHumanOnlyFields,
  isArtifactKind,
  missingRequiredFields,
  parseArtifactContent,
} from './kinds';

describe('artifact kind registry', () => {
  it('has a spec for every kind, keyed by its own name', () => {
    expect(Object.keys(ARTIFACT_KIND_SPECS).sort()).toEqual([...ARTIFACT_KINDS].sort());
    for (const kind of ARTIFACT_KINDS) {
      expect(ARTIFACT_KIND_SPECS[kind].kind).toBe(kind);
      expect(SUBJECT_TYPES).toContain(ARTIFACT_KIND_SPECS[kind].subjectType);
    }
  });

  it('knows the 18 kinds and recognises them', () => {
    expect(ARTIFACT_KINDS).toHaveLength(18);
    expect(isArtifactKind('structured_jd')).toBe(true);
    expect(isArtifactKind('nope')).toBe(false);
    expect(isArtifactKind(undefined)).toBe(false);
  });

  it('applies the ADR-006 approval rules to the right kinds', () => {
    const s = ARTIFACT_KIND_SPECS;
    expect(s.submission_report).toMatchObject({
      humanOnlyFields: ['recruiterAssessment'],
      requiredOnApprove: ['recruiterAssessment'],
      factCheckRequired: true,
    });
    expect(s.match_analysis.humanOnlyFields).toEqual(['recruiterAssessment']);
    expect(s.match_analysis.requiredOnApprove).toEqual([]);
    expect(s.tailored_resume.factCheckRequired).toBe(true);
    expect(s.structured_jd).toMatchObject({ humanOnlyFields: [], factCheckRequired: false });
  });

  it('attaches artifacts to the subject the brief implies', () => {
    expect(ARTIFACT_KIND_SPECS.structured_jd.subjectType).toBe('position');
    expect(ARTIFACT_KIND_SPECS.candidate_profile.subjectType).toBe('candidate');
    expect(ARTIFACT_KIND_SPECS.match_analysis.subjectType).toBe('pipeline_entry');
    expect(ARTIFACT_KIND_SPECS.interview_feedback.subjectType).toBe('interview');
  });

  it('validates content and rejects non-objects', () => {
    // `improved_jd` still has the permissive placeholder schema; structured_jd has its own (structured-jd.test.ts).
    expect(parseArtifactContent('improved_jd', { a: 1 })).toEqual({ a: 1 });
    expect(() => parseArtifactContent('improved_jd', 'text')).toThrow();
    expect(() => parseArtifactContent('improved_jd', [1])).toThrow();
  });

  it('detects filled human-only and missing required fields', () => {
    expect(filledHumanOnlyFields('submission_report', { recruiterAssessment: 'Strong.' })).toEqual([
      'recruiterAssessment',
    ]);
    expect(filledHumanOnlyFields('submission_report', { recruiterAssessment: '  ' })).toEqual([]);
    expect(filledHumanOnlyFields('structured_jd', { recruiterAssessment: 'x' })).toEqual([]);
    expect(missingRequiredFields('submission_report', {})).toEqual(['recruiterAssessment']);
    expect(missingRequiredFields('submission_report', { recruiterAssessment: 'ok' })).toEqual([]);
  });
});
