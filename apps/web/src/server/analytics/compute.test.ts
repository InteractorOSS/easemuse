// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import {
  computeCapacity,
  computeKpis,
  computeSources,
  median,
  milestones,
  rate,
  stageOf,
  type EntryFacts,
  type PositionFacts,
} from './compute';

const d = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
/** July to September 2026. */
const Q3 = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') };

function entry(id: string, over: Partial<EntryFacts> = {}): EntryFacts {
  return {
    id,
    positionId: 'p1',
    source: 'linkedin',
    createdAt: d('2026-07-01'),
    transitions: [],
    touches: [],
    interviews: [],
    ...over,
  };
}
const moves = (...steps: [string, string][]) =>
  steps.map(([toState, at]) => ({ toState, at: d(at) }));

/**
 * A small seeded history for one position:
 * - e1 goes all the way: contacted, answered, submitted 07-10, interviewed 07-15, offer, accepted 08-01, started.
 * - e2 is submitted 07-12 and interviewed 07-20, then rejected.
 * - e3 is contacted and never answers.
 * - e4 is a referral who declines an offer.
 * - e5 was added before the period (June) and goes nowhere in it.
 */
const history: EntryFacts[] = [
  entry('e1', {
    transitions: moves(
      ['contacting', '2026-07-02'],
      ['interested', '2026-07-03'],
      ['qualified', '2026-07-05'],
      ['submitted', '2026-07-10'],
      ['interviewing', '2026-07-14'],
      ['offer', '2026-07-25'],
      ['accepted', '2026-08-01'],
      ['started', '2026-09-01'],
    ),
    touches: [{ sentAt: d('2026-07-02'), response: 'interested' }],
    interviews: [{ at: d('2026-07-15'), status: 'completed' }],
  }),
  entry('e2', {
    transitions: moves(
      ['contacting', '2026-07-03'],
      ['interested', '2026-07-04'],
      ['submitted', '2026-07-12'],
      ['interviewing', '2026-07-20'],
      ['rejected', '2026-07-28'],
    ),
    touches: [{ sentAt: d('2026-07-03'), response: 'interested' }],
    interviews: [{ at: d('2026-07-20'), status: 'completed' }],
  }),
  entry('e3', {
    transitions: moves(['contacting', '2026-07-05'], ['no_response', '2026-07-20']),
    touches: [
      { sentAt: d('2026-07-05'), response: 'no_response' },
      { sentAt: d('2026-07-09'), response: null },
    ],
  }),
  entry('e4', {
    source: 'referral',
    transitions: moves(
      ['interested', '2026-07-06'],
      ['submitted', '2026-07-08'],
      ['interviewing', '2026-07-11'],
      ['declined', '2026-07-30'],
    ),
    interviews: [
      { at: d('2026-07-11'), status: 'completed' },
      { at: d('2026-07-09'), status: 'cancelled' },
    ],
  }),
  entry('e5', { createdAt: d('2026-06-10') }),
];
const position: PositionFacts = {
  id: 'p1',
  ownerId: 'u1',
  createdAt: d('2026-06-01'),
  statusChanges: [
    { status: 'intake', at: d('2026-06-05') },
    { status: 'sourcing', at: d('2026-06-21') },
    { status: 'offer', at: d('2026-07-25') },
    { status: 'filled', at: d('2026-08-11') },
  ],
};

describe('analytics formulas (planning-handoff §6)', () => {
  it('maps pipeline states to the step they prove, including the "no" at a step', () => {
    expect(stageOf('no_response')).toBe('contacted');
    expect(stageOf('declined')).toBe('offer');
    expect(stageOf('reneged')).toBe('accepted');
    expect(stageOf('client_rejected')).toBe('submitted');
    expect(stageOf('rejected')).toBeNull();
    expect(stageOf('withdrawn')).toBeNull();
  });

  it('counts a skipped step as reached when a later one is, and ignores cancelled interviews', () => {
    const m = milestones(history[3]!);
    expect(m.reached.contacted).toEqual(d('2026-07-06'));
    expect(m.reached.qualified).toEqual(d('2026-07-08'));
    expect(m.firstInterviewAt).toEqual(d('2026-07-11'));
    expect(m.responded).toBe(false);
    expect(milestones(history[2]!)).toMatchObject({
      responded: false,
      firstSentAt: d('2026-07-05'),
    });
  });

  it('computes the nine KPIs over a seeded history', () => {
    const k = computeKpis(history, [position], Q3);
    // Sourcing 06-21 to first accepted offer 08-01 = 41 days.
    expect(k.timeToFill).toEqual({ medianDays: 41, count: 1 });
    // Submitted to first interview: e1 5 days, e2 8 days, e4 3 days -> median 5.
    expect(k.timeToInterview).toEqual({ medianDays: 5, count: 3 });
    // Outreach sent to e1, e2, e3; e1 and e2 answered.
    expect(k.outreachResponse).toEqual(rate(2, 3));
    // Submitted: e1, e2, e4; all three interviewed.
    expect(k.submissionToInterview).toEqual(rate(3, 3));
    // Interviewed: e1, e2, e4; offers to e1 and e4.
    expect(k.interviewToOffer).toEqual(rate(2, 3));
    // Offers: e1 and e4; only e1 accepted.
    expect(k.offerAcceptance).toEqual(rate(1, 2));
    expect(k.interviewToHire).toEqual(rate(1, 3));
    // Added in the period: e1..e4 (e5 was added in June); one started.
    expect(k.sourceToHire).toEqual(rate(1, 4));
    expect(k.conversion.find((c) => c.from === 'sourced')!.rate).toEqual(rate(4, 4));
    expect(k.conversion.find((c) => c.from === 'contacted')!.rate).toEqual(rate(3, 4));
    expect(k.conversion.find((c) => c.from === 'accepted')!.rate).toEqual(rate(1, 1));
    expect(k.conversion).toHaveLength(8);
  });

  it('counts an entry only when its starting event falls in the period', () => {
    const august = { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-09-01T00:00:00Z') };
    const k = computeKpis(history, [position], august);
    // Nobody was submitted or interviewed in August, so those rates have nothing to say.
    expect(k.submissionToInterview).toEqual({ numerator: 0, denominator: 0, value: null });
    expect(k.timeToInterview).toEqual({ medianDays: null, count: 0 });
    // The accepted offer of 08-01 closes the position's time to fill in August.
    expect(k.timeToFill.count).toBe(1);
  });

  it('breaks results down by source for the candidates added in the period', () => {
    const rows = computeSources(history, Q3);
    expect(rows).toEqual([
      expect.objectContaining({
        source: 'linkedin',
        added: 3,
        contacted: 3,
        submitted: 2,
        interviewed: 2,
        offered: 1,
        hired: 1,
        hireRate: rate(1, 3),
      }),
      expect.objectContaining({ source: 'referral', added: 1, offered: 1, hired: 0 }),
    ]);
  });

  it('measures capacity as positions being worked per recruiter per week, and time per filled position', () => {
    const second: PositionFacts = {
      id: 'p2',
      ownerId: 'u1',
      createdAt: d('2026-07-01'),
      statusChanges: [{ status: 'sourcing', at: d('2026-07-01') }],
    };
    const other: PositionFacts = {
      id: 'p3',
      ownerId: 'u2',
      createdAt: d('2026-05-01'),
      statusChanges: [{ status: 'on_hold', at: d('2026-05-02') }],
    };
    const c = computeCapacity([position, second, other], Q3);
    expect(c.weeks).toBe(14);
    // p1 is worked from 06-21 to 08-11 (weeks 1-6 of the period), p2 the whole period (14 weeks):
    // (6 + 14) / 14 = 1.43.
    expect(c.recruiters).toEqual([
      expect.objectContaining({ userId: 'u1', activePositionsPerWeek: 1.4, filled: 1 }),
    ]);
    // u2's position was on hold the whole time, so u2 carried nothing.
    expect(c.activePositionsPerRecruiter).toBe(1.4);
    // Sourcing 06-21 to filled 08-11 = 51 days.
    expect(c.timePerPosition).toEqual({ medianDays: 51, count: 1 });
  });

  it('takes the middle value, or the mean of the two middle values', () => {
    expect(median([5, 1, 3]).medianDays).toBe(3);
    expect(median([4, 1, 2, 3]).medianDays).toBe(2.5);
    expect(median([])).toEqual({ medianDays: null, count: 0 });
  });
});
