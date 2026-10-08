// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { computeAdoption } from './adoption';

describe('portal adoption (T-14-08)', () => {
  it('is portal approvals, reviews and feedback ÷ all of them, recorded ones included', () => {
    const result = computeAdoption({
      approvals: [{ source: 'portal' }, { source: 'portal' }, { source: 'recorded_by_recruiter' }],
      feedback: [{ source: 'recorded_by_recruiter' }],
      reviews: [{ viaPortal: true }, { viaPortal: false }],
    });
    expect(result.approvals).toMatchObject({ numerator: 2, denominator: 3 });
    expect(result.feedback).toMatchObject({ numerator: 0, denominator: 1 });
    expect(result.reviews).toMatchObject({ numerator: 1, denominator: 2 });
    expect(result.overall).toEqual({ numerator: 3, denominator: 6, rate: 0.5 });
  });

  it('has no rate, not 0%, before anything was done', () => {
    const result = computeAdoption({ approvals: [], feedback: [], reviews: [] });
    expect(result.overall.rate).toBeNull();
  });
});
