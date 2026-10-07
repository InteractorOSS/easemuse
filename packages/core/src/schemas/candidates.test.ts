// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { CANDIDATE_SOURCES, candidateIntakeSchema, candidateIntakeTextSchema } from '..';

describe('candidate intake input', () => {
  it('needs a known source and takes an optional profile link', () => {
    expect(CANDIDATE_SOURCES).toContain('linkedin');
    expect(
      candidateIntakeSchema.safeParse({
        source: 'linkedin',
        profileUrl: 'https://www.linkedin.com/in/alex',
      }).success,
    ).toBe(true);
    expect(candidateIntakeSchema.safeParse({ source: 'linkedin' }).success).toBe(true);
    expect(candidateIntakeSchema.safeParse({ source: 'scraped' }).success).toBe(false);
    expect(
      candidateIntakeSchema.safeParse({ source: 'other', profileUrl: 'not a url' }).success,
    ).toBe(false);
  });
  it('treats a blank link as none', () => {
    expect(
      candidateIntakeSchema.parse({ source: 'referral', profileUrl: '' }).profileUrl,
    ).toBeUndefined();
  });
  it('wants real text when pasted, not a few words', () => {
    expect(
      candidateIntakeTextSchema.safeParse({ source: 'other', profileText: 'short' }).success,
    ).toBe(false);
    expect(
      candidateIntakeTextSchema.safeParse({ source: 'other', profileText: 'x'.repeat(60) }).success,
    ).toBe(true);
  });
});
