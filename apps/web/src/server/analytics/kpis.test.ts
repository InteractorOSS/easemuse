// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { computeCapacity } from './capacity';
import { toCsv } from './csv';
import {
  computeKpis,
  median,
  ratio,
  sourceTable,
  stageFunnel,
  type EntryRow,
  type PositionRow,
} from './kpis';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const RANGE = { from: d('2026-07-01'), to: d('2026-10-01') };

let n = 0;
function entry(over: Partial<EntryRow> & { path?: [string, string][] }): EntryRow {
  const { path = [], ...rest } = over;
  return {
    id: `e${++n}`,
    ownerId: 'r1',
    positionId: 'p1',
    source: 'linkedin',
    createdAt: d('2026-07-05'),
    transitions: path.map(([toState, at]) => ({ toState, at: d(at) })),
    touches: [],
    interviews: [],
    submissions: [],
    ...rest,
  };
}

/** Ten entries: a history with every kind of ending. */
function history(): EntryRow[] {
  return [
    // Hired: LinkedIn, submitted 07-20, interview 07-25, offer, accepted, started.
    entry({
      path: [
        ['screened', '2026-07-06'],
        ['contacting', '2026-07-07'],
        ['interested', '2026-07-08'],
        ['qualified', '2026-07-10'],
        ['submitted', '2026-07-20'],
        ['interviewing', '2026-07-25'],
        ['offer', '2026-08-10'],
        ['accepted', '2026-08-12'],
        ['started', '2026-09-15'],
      ],
      touches: [{ status: 'sent', response: 'interested', at: d('2026-07-07') }],
      submissions: [{ at: d('2026-07-20') }],
      interviews: [{ at: d('2026-07-25') }],
    }),
    // Offer declined: referral, interviewed, never started.
    entry({
      source: 'referral',
      path: [
        ['screened', '2026-07-06'],
        ['contacting', '2026-07-07'],
        ['interested', '2026-07-09'],
        ['qualified', '2026-07-11'],
        ['submitted', '2026-07-21'],
        ['interviewing', '2026-07-30'],
        ['offer', '2026-08-15'],
        ['declined', '2026-08-18'],
      ],
      touches: [{ status: 'sent', response: 'interested', at: d('2026-07-07') }],
      submissions: [{ at: d('2026-07-21') }],
      interviews: [{ at: d('2026-07-31') }],
    }),
    // Interviewed and rejected: LinkedIn.
    entry({
      path: [
        ['screened', '2026-07-06'],
        ['contacting', '2026-07-08'],
        ['interested', '2026-07-10'],
        ['qualified', '2026-07-12'],
        ['submitted', '2026-07-22'],
        ['interviewing', '2026-08-01'],
        ['rejected', '2026-08-05'],
      ],
      touches: [{ status: 'sent', response: 'not_now', at: d('2026-07-08') }],
      submissions: [{ at: d('2026-07-22') }],
      interviews: [{ at: d('2026-08-03') }],
    }),
    // Submitted, client rejected without an interview: database.
    entry({
      source: 'database',
      path: [
        ['screened', '2026-07-06'],
        ['contacting', '2026-07-08'],
        ['interested', '2026-07-10'],
        ['qualified', '2026-07-12'],
        ['submitted', '2026-07-23'],
        ['client_rejected', '2026-07-26'],
      ],
      touches: [{ status: 'sent', response: 'interested', at: d('2026-07-08') }],
      submissions: [{ at: d('2026-07-23') }],
    }),
    // Contacted, no reply.
    entry({
      path: [
        ['screened', '2026-07-06'],
        ['contacting', '2026-07-08'],
        ['no_response', '2026-07-20'],
      ],
      touches: [
        { status: 'sent', response: 'no_response', at: d('2026-07-08') },
        { status: 'sent', response: null, at: d('2026-07-15') },
      ],
    }),
    // Contacted, not interested.
    entry({
      source: 'networking',
      path: [
        ['contacting', '2026-07-09'],
        ['not_interested', '2026-07-12'],
      ],
      touches: [{ status: 'sent', response: 'not_interested', at: d('2026-07-09') }],
    }),
    // Never contacted.
    entry({ source: 'other', path: [['screened', '2026-07-10']] }),
    entry({ path: [] }),
    // Added before the range: outside the cohort, so the caller does not pass it.
  ];
}

describe('KPI formulas (T-11-01, planning-handoff §6)', () => {
  const kpis = computeKpis(history(), [], RANGE);

  it('Outreach Response Rate = entries with any reply ÷ entries with a sent touch', () => {
    // 6 contacted; replies: hired, declined, rejected(not_now), client_rejected, not_interested = 5. "no_response" is not a reply.
    expect(kpis.outreachResponseRate).toEqual({ numerator: 5, denominator: 6, rate: 5 / 6 });
  });

  it('Submission-to-Interview = entries with an interview ÷ entries submitted', () => {
    expect(kpis.submissionToInterview).toEqual(ratio(3, 4));
  });

  it('Interview-to-Offer = entries reaching offer ÷ entries with an interview', () => {
    expect(kpis.interviewToOffer).toEqual(ratio(2, 3));
  });

  it('Offer Acceptance = accepted ÷ offer (a declined offer counts as an offer)', () => {
    expect(kpis.offerAcceptance).toEqual(ratio(1, 2));
  });

  it('Interview-to-Hire and Source-to-Hire count started, not accepted', () => {
    expect(kpis.interviewToHire).toEqual(ratio(1, 3));
    expect(kpis.sourceToHire).toEqual(ratio(1, 8));
  });

  it('Time-to-Interview is the median days from the first submission to the first interview', () => {
    // 5, 10, 12 days.
    expect(kpis.timeToInterview).toEqual({ count: 3, medianDays: 10 });
  });

  it('shows no rate rather than 0% when there is nothing to divide by', () => {
    const empty = computeKpis([], [], RANGE);
    expect(empty.offerAcceptance.rate).toBeNull();
    expect(empty.timeToFill).toEqual({ count: 0, medianDays: null });
  });

  it('Candidate Conversion Rate is per stage, counting entries that skipped a stage as having passed it', () => {
    const skipped = entry({ path: [['qualified', '2026-07-10']] });
    const funnel = stageFunnel([...history(), skipped]);
    const row = (s: string) => funnel.find((r) => r.stage === s)!;
    expect(row('sourced').reached).toBe(9);
    expect(row('screened')).toMatchObject({ reached: 8 });
    // The skipped entry counts as screened, contacted and interested because it reached qualified.
    expect(row('qualified').reached).toBe(5);
    expect(row('submitted').conversion).toEqual(ratio(4, 5));
    expect(row('started').conversion).toEqual(ratio(1, 1));
  });
});

describe('Time-to-Fill (median days from sourcing to the last "filled")', () => {
  const position = (id: string, over: Partial<PositionRow>): PositionRow => ({
    id,
    ownerId: 'r1',
    clientId: 'c1',
    status: 'filled',
    createdAt: d('2026-06-20'),
    transitions: [],
    ...over,
  });

  it('measures filled positions whose fill date is in the range, and ignores the rest', () => {
    const positions = [
      position('a', {
        transitions: [
          { toStatus: 'draft', at: d('2026-06-20') },
          { toStatus: 'sourcing', at: d('2026-07-01') },
          { toStatus: 'filled', at: d('2026-08-10') },
        ],
      }),
      position('b', {
        transitions: [
          { toStatus: 'sourcing', at: d('2026-07-10') },
          { toStatus: 'filled', at: d('2026-09-08') },
        ],
      }),
      // Filled before the range.
      position('c', {
        transitions: [
          { toStatus: 'sourcing', at: d('2026-05-01') },
          { toStatus: 'filled', at: d('2026-06-01') },
        ],
      }),
      // Not filled any more (a placement fell through).
      position('d', {
        status: 'interviewing',
        transitions: [
          { toStatus: 'sourcing', at: d('2026-07-01') },
          { toStatus: 'filled', at: d('2026-08-01') },
          { toStatus: 'interviewing', at: d('2026-08-20') },
        ],
      }),
    ];
    // a: 40 days, b: 60 days.
    expect(computeKpis([], positions, RANGE).timeToFill).toEqual({ count: 2, medianDays: 50 });
  });

  it('starts at creation when the position never went through "sourcing"', () => {
    const p = position('e', {
      createdAt: d('2026-07-01'),
      transitions: [{ toStatus: 'filled', at: d('2026-07-11') }],
    });
    expect(computeKpis([], [p], RANGE).timeToFill.medianDays).toBe(10);
  });
});

describe('Source table (T-11-02)', () => {
  it('counts each stage per source and the conversion between stages', () => {
    const rows = sourceTable(history());
    const linkedin = rows.find((r) => r.source === 'linkedin')!;
    expect(linkedin).toMatchObject({
      added: 4,
      contacted: 3,
      submitted: 2,
      interviewed: 2,
      offered: 1,
      hired: 1,
    });
    expect(linkedin.conversions.submitted).toEqual(ratio(2, 3));
    expect(linkedin.sourceToHire).toEqual(ratio(1, 4));
    expect(rows.map((r) => r.source)).toEqual([
      'linkedin',
      'referral',
      'direct_sourcing',
      'database',
      'networking',
      'other',
    ]);
    expect(rows.find((r) => r.source === 'direct_sourcing')!.sourceToHire.rate).toBeNull();
  });

  it('adds up to the totals of the other tables', () => {
    const rows = sourceTable(history());
    expect(rows.reduce((a, r) => a + r.added, 0)).toBe(8);
    expect(rows.reduce((a, r) => a + r.hired, 0)).toBe(1);
  });
});

describe('Capacity (T-11-03, DP-5)', () => {
  const position = (id: string, ownerId: string, transitions: [string, string][]): PositionRow => ({
    id,
    ownerId,
    clientId: 'c1',
    status: transitions.at(-1)![0],
    createdAt: d('2026-06-01'),
    transitions: transitions.map(([toStatus, at]) => ({ toStatus, at: d(at) })),
  });

  it('averages positions in sourcing to offer over the weeks, per recruiter', () => {
    // Range of 4 weeks from 2026-07-01 (28 days).
    const range = { from: d('2026-07-01'), to: d('2026-07-29') };
    const rows = computeCapacity(
      [
        // Active the whole range.
        position('a', 'r1', [['sourcing', '2026-06-15']]),
        // Active from week 3 on: counted in weeks 3 and 4.
        position('b', 'r1', [
          ['draft', '2026-06-15'],
          ['sourcing', '2026-07-16'],
        ]),
        // On hold throughout: never counted.
        position('c', 'r2', [
          ['sourcing', '2026-06-15'],
          ['on_hold', '2026-06-20'],
        ]),
      ],
      range,
    );
    const by = (id: string | null) => rows.find((r) => r.recruiterId === id)!;
    expect(by('r1').positionsPerWeek).toBe(1.5);
    expect(by('r2').positionsPerWeek).toBe(0);
    expect(by(null).positionsPerWeek).toBe(1.5);
    expect(by(null).weeks).toBe(4);
  });

  it('measures time per position in active days, leaving out time on hold', () => {
    const range = { from: d('2026-07-01'), to: d('2026-10-01') };
    const [all] = computeCapacity(
      [
        position('a', 'r1', [
          ['sourcing', '2026-07-01'],
          ['on_hold', '2026-07-11'],
          ['sourcing', '2026-07-21'],
          ['filled', '2026-07-31'],
        ]),
      ],
      range,
    );
    // 10 days + 10 days active, 10 on hold.
    expect(all!.timePerPosition).toEqual({ count: 1, medianDays: 20 });
  });
});

describe('helpers', () => {
  it('median of an even and an odd list', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('CSV quotes, keeps a BOM and defuses spreadsheet formulas', () => {
    const csv = toCsv(
      ['a', 'b'],
      [
        ['x,y', 'say "hi"'],
        ['=SUM(A1)', 5],
        [null, -3],
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x,y","say ""hi"""');
    expect(csv).toContain("'=SUM(A1),5");
    expect(csv).toContain(',-3');
  });
});
