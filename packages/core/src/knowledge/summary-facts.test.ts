// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { patternSummaryContentSchema } from '../artifacts/pattern-summary';
import { buildPatternReports, type EntryFact } from './patterns';
import { checkStatements, summaryContent, summaryFacts } from './summary-facts';

let n = 0;
const entry = (over: Partial<EntryFact> = {}): EntryFact => ({
  entryId: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  positionId: '00000000-0000-4000-9000-000000000001',
  clientId: '00000000-0000-4000-a000-000000000001',
  seniority: 'Director',
  yearsExperience: 9,
  skills: ['Go'],
  source: 'referral',
  submitted: true,
  interviewed: false,
  offered: false,
  hired: false,
  contacted: true,
  responded: true,
  decision: null,
  exit: null,
  feedback: {},
  criteria: null,
  ...over,
});

const entries = [
  ...Array.from({ length: 6 }, () => entry({ interviewed: true, decision: 'advanced' })),
  ...Array.from({ length: 4 }, () => entry({ decision: 'declined' })),
  entry({ seniority: 'Manager', interviewed: true, hired: true }),
];
const reports = buildPatternReports(entries, [
  {
    positionId: '00000000-0000-4000-9000-000000000001',
    title: 'Platform lead',
    clientId: '00000000-0000-4000-a000-000000000001',
    workArrangement: 'remote',
    statesPay: true,
  },
]);
const facts = summaryFacts(reports);

describe('summaryFacts', () => {
  it('numbers the facts and keeps the counts and records behind each', () => {
    expect(facts[0]!.id).toBe('F1');
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
    const director = facts.find(
      (f) => f.label.includes('seniority "Director"') && f.question === 'interviewProfiles',
    )!;
    expect(director).toMatchObject({ n: 10, hits: 6, rate: 60, small: false });
    expect(director.refs.length).toBeGreaterThan(0);
  });

  it('leaves out facts without records and facts that name a protected characteristic', () => {
    const r = buildPatternReports([entry({ skills: ['Female leadership network', 'Go'] })], []);
    const f = summaryFacts(r);
    expect(f.every((x) => x.n > 0)).toBe(true);
    expect(JSON.stringify(f)).not.toMatch(/female/i);
  });
});

describe('checkStatements', () => {
  const director = facts.find(
    (f) => f.label.includes('seniority "Director"') && f.question === 'interviewProfiles',
  )!;

  it('keeps a sentence whose numbers come from the facts it cites, and copies the evidence', () => {
    const { kept, dropped } = checkStatements(
      {
        statements: [
          {
            text: `6 of 10 submitted Directors were invited to interview (${director.rate}%).`,
            factIds: [director.id],
          },
        ],
      },
      facts,
    );
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.evidence[0]).toMatchObject({
      factId: director.id,
      n: 10,
      hits: 6,
      refCount: 10,
    });
    expect(kept[0]!.tentative).toBe(false);
  });

  it('marks a sentence tentative when a fact it cites is a small sample', () => {
    const small = facts.find((f) => f.small)!;
    const { kept } = checkStatements(
      { statements: [{ text: 'Only a few records.', factIds: [small.id] }] },
      facts,
    );
    expect(kept[0]!.tentative).toBe(true);
  });

  it('removes a sentence with an invented number', () => {
    const { kept, dropped } = checkStatements(
      { statements: [{ text: '9 of 10 Directors were invited.', factIds: [director.id] }] },
      facts,
    );
    expect(kept).toEqual([]);
    expect(dropped[0]!.reason).toBe('number_not_in_facts');
  });

  it('removes a sentence citing a fact that does not exist', () => {
    const { dropped } = checkStatements(
      { statements: [{ text: 'Many.', factIds: ['F999'] }] },
      facts,
    );
    expect(dropped[0]!.reason).toBe('unknown_fact');
  });

  it('removes a sentence that names a protected characteristic, even with correct numbers', () => {
    const { kept, dropped } = checkStatements(
      {
        statements: [
          { text: 'Younger candidates were invited 6 times out of 10.', factIds: [director.id] },
          { text: 'The hiring manager seems to prefer men (6 of 10).', factIds: [director.id] },
        ],
      },
      facts,
    );
    expect(kept).toEqual([]);
    expect(dropped.map((d) => d.reason)).toEqual(['protected', 'protected']);
  });

  it('builds a stored draft that matches the content schema and says how much was removed', () => {
    const content = summaryContent(
      {
        statements: [
          { text: `${director.hits} of ${director.n} Directors.`, factIds: [director.id] },
          { text: '77 Directors.', factIds: [director.id] },
        ],
      },
      facts,
      {
        clientId: '00000000-0000-4000-a000-000000000001',
        clientName: 'Acme',
        asOf: '2026-10-07',
        records: 11,
        positions: 1,
        withheld: 0,
      },
    );
    expect(patternSummaryContentSchema.safeParse(content).success).toBe(true);
    expect(content.statements).toHaveLength(1);
    expect(content.checks).toEqual({ removed: 1, withheld: 0 });
  });
});
