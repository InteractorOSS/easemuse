// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  milestonesSchema,
  nextOfferReminder,
  offerOutcomeInputSchema,
  OFFER_MILESTONES,
} from './offers';

const at = (iso: string) => new Date(`${iso}T10:00:00Z`);

describe('offer milestones', () => {
  it('has the nine items of brief 12, each not started by default', () => {
    expect(OFFER_MILESTONES).toHaveLength(9);
    const m = milestonesSchema.parse({});
    expect(Object.values(m).every((v) => v.status === 'not_started' && v.date === null)).toBe(true);
  });
});

describe('offer outcome input', () => {
  it('needs a reason code for declined and words for reneged', () => {
    expect(
      offerOutcomeInputSchema.safeParse({ outcome: 'declined', at: '2026-10-01' }).success,
    ).toBe(false);
    expect(
      offerOutcomeInputSchema.safeParse({
        outcome: 'declined',
        at: '2026-10-01',
        reasonCode: 'compensation',
      }).success,
    ).toBe(true);
    expect(
      offerOutcomeInputSchema.safeParse({ outcome: 'reneged', at: '2026-10-01' }).success,
    ).toBe(false);
    expect(
      offerOutcomeInputSchema.safeParse({
        outcome: 'reneged',
        at: '2026-10-01',
        reason: 'Took the counteroffer',
      }).success,
    ).toBe(true);
    expect(
      offerOutcomeInputSchema.safeParse({ outcome: 'accepted', at: '2026-10-01' }).success,
    ).toBe(true);
    expect(
      offerOutcomeInputSchema.safeParse({ outcome: 'started', at: '10/01/2026' }).success,
    ).toBe(false);
  });
});

describe('nextOfferReminder (FR-OFF-02)', () => {
  const offer = { resignationDate: '2026-10-20', startDate: '2026-11-15', outcome: 'accepted' };

  it('returns the earliest reminder that has not passed', () => {
    expect(nextOfferReminder(offer, at('2026-10-10'))).toEqual({
      kind: 'after_resignation',
      dueAt: new Date('2026-10-21T00:00:00Z'),
    });
    expect(nextOfferReminder(offer, at('2026-10-21'))).toEqual({
      kind: 'after_resignation',
      dueAt: new Date('2026-10-21T00:00:00Z'),
    });
    expect(nextOfferReminder(offer, at('2026-10-22'))).toEqual({
      kind: 'week_before_start',
      dueAt: new Date('2026-11-08T00:00:00Z'),
    });
    expect(nextOfferReminder(offer, at('2026-11-09'))).toEqual({
      kind: 'day_after_start',
      dueAt: new Date('2026-11-16T00:00:00Z'),
    });
    expect(nextOfferReminder(offer, at('2026-11-17'))).toBeNull();
  });

  it('skips a reminder that was just completed', () => {
    const done = new Date('2026-10-21T00:00:00Z');
    expect(nextOfferReminder(offer, at('2026-10-21'), done)?.kind).toBe('week_before_start');
  });

  it('works with only a start date, and stops once the placement has an outcome', () => {
    expect(
      nextOfferReminder(
        { resignationDate: null, startDate: '2026-11-15', outcome: null },
        at('2026-10-01'),
      )?.kind,
    ).toBe('week_before_start');
    expect(
      nextOfferReminder(
        { resignationDate: null, startDate: null, outcome: null },
        at('2026-10-01'),
      ),
    ).toBeNull();
    for (const outcome of ['started', 'declined', 'reneged']) {
      expect(nextOfferReminder({ ...offer, outcome }, at('2026-10-10'))).toBeNull();
    }
  });
});
