// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  OUTREACH_CLASSES,
  SCREENING_CLASSES,
  SCREENING_ITEMS,
  classificationInputSchema,
  screeningInputSchema,
} from './screening';

describe('screening', () => {
  it('has the 14 items of the brief', () => {
    expect(SCREENING_ITEMS).toHaveLength(14);
    expect(new Set(SCREENING_ITEMS).size).toBe(14);
  });

  it('takes any subset of items with a rating and notes, none mandatory', () => {
    expect(screeningInputSchema.safeParse({ items: {} }).success).toBe(true);
    expect(
      screeningInputSchema.safeParse({
        items: {
          jobChanges: { rating: 'concern', notes: 'Three roles in two years' },
          teamSize: { notes: '12' },
        },
      }).success,
    ).toBe(true);
    expect(
      screeningInputSchema.safeParse({ items: { jobChanges: { rating: null } } }).success,
    ).toBe(true);
  });

  it('rejects an unknown rating, an unknown item and very long notes', () => {
    expect(
      screeningInputSchema.safeParse({ items: { jobChanges: { rating: 'great' } } }).success,
    ).toBe(false);
    expect(screeningInputSchema.safeParse({ items: { charm: { rating: 'strong' } } }).success).toBe(
      true,
    ); // unknown keys are dropped, not stored
    expect(screeningInputSchema.parse({ items: { charm: { rating: 'strong' } } }).items).toEqual(
      {},
    );
    expect(
      screeningInputSchema.safeParse({ items: { teamSize: { notes: 'x'.repeat(2001) } } }).success,
    ).toBe(false);
  });
});

describe('classification', () => {
  it('has the four classes, and only priority and potential continue to outreach', () => {
    expect([...SCREENING_CLASSES]).toEqual(['priority', 'potential', 'hold', 'not_qualified']);
    expect([...OUTREACH_CLASSES]).toEqual(['priority', 'potential']);
  });
  it('always needs a reason for Not Qualified, and allows one for the others', () => {
    expect(classificationInputSchema.safeParse({ screeningClass: 'not_qualified' }).success).toBe(
      false,
    );
    expect(
      classificationInputSchema.safeParse({
        screeningClass: 'not_qualified',
        reason: 'No work permit',
      }).success,
    ).toBe(true);
    expect(classificationInputSchema.safeParse({ screeningClass: 'priority' }).success).toBe(true);
    expect(
      classificationInputSchema.safeParse({ screeningClass: 'hold', reason: 'Wait for budget' })
        .success,
    ).toBe(true);
    expect(classificationInputSchema.safeParse({ screeningClass: 'maybe' }).success).toBe(false);
  });
});
