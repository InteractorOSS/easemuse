// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { matchOverrideInputSchema, recruiterAssessmentInputSchema } from './matching';

describe('override input', () => {
  it('takes an overall or a criterion override with a score and a reason', () => {
    expect(
      matchOverrideInputSchema.safeParse({
        kind: 'overall',
        score: 70,
        reason: 'Interview went well',
      }).success,
    ).toBe(true);
    expect(
      matchOverrideInputSchema.safeParse({
        kind: 'criterion',
        key: 'coreCompetencies',
        score: 40,
        reason: 'Less depth than the resume',
      }).success,
    ).toBe(true);
  });
  it('lets a null score take an override away', () => {
    expect(
      matchOverrideInputSchema.safeParse({
        kind: 'overall',
        score: null,
        reason: 'Back to computed',
      }).success,
    ).toBe(true);
  });
  it('always needs a reason', () => {
    expect(matchOverrideInputSchema.safeParse({ kind: 'overall', score: 70 }).success).toBe(false);
    expect(
      matchOverrideInputSchema.safeParse({ kind: 'overall', score: 70, reason: 'x' }).success,
    ).toBe(false);
  });
  it('rejects scores outside 0 to 100, fractions, and unknown criteria', () => {
    expect(
      matchOverrideInputSchema.safeParse({ kind: 'overall', score: 101, reason: 'Too high' })
        .success,
    ).toBe(false);
    expect(
      matchOverrideInputSchema.safeParse({ kind: 'overall', score: -1, reason: 'Too low' }).success,
    ).toBe(false);
    expect(
      matchOverrideInputSchema.safeParse({ kind: 'overall', score: 70.5, reason: 'Fraction' })
        .success,
    ).toBe(false);
    expect(
      matchOverrideInputSchema.safeParse({
        kind: 'criterion',
        key: 'charm',
        score: 50,
        reason: 'Unknown',
      }).success,
    ).toBe(false);
    expect(
      matchOverrideInputSchema.safeParse({ kind: 'criterion', score: 50, reason: 'No key' })
        .success,
    ).toBe(false);
  });
});

describe('assessment input', () => {
  it('takes text, trims it, and allows empty to clear', () => {
    expect(recruiterAssessmentInputSchema.parse({ text: '  Strong fit.  ' }).text).toBe(
      'Strong fit.',
    );
    expect(recruiterAssessmentInputSchema.safeParse({ text: '' }).success).toBe(true);
    expect(recruiterAssessmentInputSchema.safeParse({ text: 'x'.repeat(4001) }).success).toBe(
      false,
    );
  });
});
