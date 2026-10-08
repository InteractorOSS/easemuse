// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { MIN_SAMPLE } from './guardrails';
import {
  MAX_REFS,
  PATTERN_QUESTIONS,
  buildPatternReports,
  type EntryFact,
  type PositionFact,
} from './patterns';

let counter = 0;
const guid = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

const entry = (over: Partial<EntryFact> = {}): EntryFact => ({
  entryId: guid(),
  positionId: 'p1',
  clientId: 'c1',
  seniority: 'Senior',
  yearsExperience: 8,
  skills: ['TypeScript'],
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

const positions: PositionFact[] = [
  {
    positionId: 'p1',
    title: 'Platform lead',
    clientId: 'c1',
    workArrangement: 'remote',
    statesPay: true,
  },
  {
    positionId: 'p2',
    title: 'Data lead',
    clientId: 'c1',
    workArrangement: 'onsite',
    statesPay: false,
  },
];

describe('buildPatternReports', () => {
  it('has one report for each of the seven questions', () => {
    const r = buildPatternReports([], positions);
    expect(PATTERN_QUESTIONS).toHaveLength(7);
    for (const q of PATTERN_QUESTIONS) expect(r[q]).toBeDefined();
    expect(r.entries).toBe(0);
  });

  it('counts how many submitted candidates reached an interview, by profile, with the records behind it', () => {
    const rows = [
      entry({ seniority: 'Director', interviewed: true }),
      entry({ seniority: 'Director', interviewed: true }),
      entry({ seniority: 'Director' }),
      entry({ seniority: 'Manager' }),
      entry({ submitted: false, seniority: 'Director', interviewed: true }),
    ];
    const r = buildPatternReports(rows, positions);
    expect(r.interviewProfiles.base).toMatchObject({ n: 4, hits: 2, rate: 50 });
    const director = r.interviewProfiles.seniority.find((x) => x.label === 'Director')!;
    expect(director).toMatchObject({ n: 3, hits: 2, rate: 67, refCount: 3 });
    expect(director.refs.map((x) => x.entryId)).toEqual(rows.slice(0, 3).map((x) => x.entryId));
    // never computed from a record that was not submitted
    expect(r.interviewProfiles.seniority.reduce((a, x) => a + x.n, 0)).toBe(4);
  });

  it('flags a small sample and clears the flag at the threshold', () => {
    const few = buildPatternReports(
      Array.from({ length: MIN_SAMPLE - 1 }, () => entry({ hired: true })),
      positions,
    );
    expect(few.hireProfiles.base.small).toBe(true);
    const enough = buildPatternReports(
      Array.from({ length: MIN_SAMPLE }, () => entry({ hired: true })),
      positions,
    );
    expect(enough.hireProfiles.base.small).toBe(false);
    expect(enough.hireProfiles.base).toMatchObject({ n: MIN_SAMPLE, hits: MIN_SAMPLE, rate: 100 });
  });

  it('caps the references but not the count', () => {
    const rows = Array.from({ length: MAX_REFS + 10 }, () => entry());
    const r = buildPatternReports(rows, positions);
    expect(r.interviewProfiles.base.refs).toHaveLength(MAX_REFS);
    expect(r.interviewProfiles.base.refCount).toBe(MAX_REFS + 10);
    expect(r.interviewProfiles.base.n).toBe(MAX_REFS + 10);
  });

  it('groups by experience in bands and says "Not stated" when unknown', () => {
    const r = buildPatternReports(
      [
        entry({ yearsExperience: 1 }),
        entry({ yearsExperience: 12 }),
        entry({ yearsExperience: null }),
      ],
      positions,
    );
    expect(r.interviewProfiles.experience.map((x) => x.label).sort()).toEqual([
      '0-2 years',
      '11+ years',
      'Not stated',
    ]);
  });

  it('counts a candidate under each of their skills and keeps the most common', () => {
    const rows = [
      entry({ skills: ['Go', 'Kubernetes'] }),
      entry({ skills: ['Go'] }),
      ...Array.from({ length: 20 }, (_, i) => entry({ skills: [`Rare ${i}`] })),
    ];
    const r = buildPatternReports(rows, positions);
    expect(r.interviewProfiles.skill[0]).toMatchObject({ label: 'Go', n: 2 });
    expect(r.interviewProfiles.skill.length).toBeLessThanOrEqual(12);
  });

  it('reports sources with added, contacted, submitted, interviewed and hired', () => {
    const rows = [
      entry({ source: 'linkedin', interviewed: true, hired: true }),
      entry({ source: 'linkedin', interviewed: true }),
      entry({ source: 'linkedin', submitted: false, contacted: false }),
      entry({ source: 'referral' }),
    ];
    const s = buildPatternReports(rows, positions).sources;
    expect(s.find((x) => x.source === 'linkedin')).toMatchObject({
      added: 3,
      contacted: 2,
      submitted: 2,
      interviewed: 2,
      hired: 1,
      qualityRate: 100,
      small: true,
    });
    expect(s.find((x) => x.source === 'referral')).toMatchObject({ added: 1, qualityRate: 0 });
  });

  it('reports response by position and by the traits of the position', () => {
    const rows = [
      entry({ positionId: 'p1', responded: true }),
      entry({ positionId: 'p1', responded: false }),
      entry({ positionId: 'p2', responded: false }),
      entry({ positionId: 'p2', contacted: false, responded: false }),
    ];
    const j = buildPatternReports(rows, positions).jdResponse;
    expect(j.byPosition.find((x) => x.label === 'Platform lead')).toMatchObject({
      n: 2,
      hits: 1,
      rate: 50,
    });
    expect(j.byPosition.find((x) => x.label === 'Data lead')).toMatchObject({ n: 1, hits: 0 });
    expect(j.byArrangement.find((x) => x.label === 'remote')).toMatchObject({ n: 2, hits: 1 });
    expect(j.byPay.map((x) => x.label).sort()).toEqual(['No pay range', 'Pay range stated']);
  });

  it('reports where candidates left, with the agency reason codes', () => {
    const rows = [
      entry({ exit: { stage: 'contacting', reasonCode: 'Compensation' } }),
      entry({ exit: { stage: 'contacting', reasonCode: 'Compensation' } }),
      entry({ exit: { stage: 'interviewing', reasonCode: 'Skills gap' } }),
      entry(),
    ];
    const d = buildPatternReports(rows, positions).dropOff;
    expect(d.left).toBe(3);
    expect(d.rows[0]).toMatchObject({
      stage: 'contacting',
      count: 2,
      share: 67,
      reasons: [{ code: 'Compensation', count: 2 }],
    });
  });

  it('shows what hiring managers advanced and how they rate, counting ratings not candidates', () => {
    const rows = [
      entry({
        decision: 'advanced',
        interviewed: true,
        feedback: { technicalFit: { strong: 2, gap: 1 } },
      }),
      entry({
        decision: 'declined',
        feedback: { technicalFit: { moderate: 1 }, communication: { strong: 1 } },
        exit: { stage: 'submitted', reasonCode: 'Too junior' },
      }),
      entry({ decision: null }),
    ];
    const h = buildPatternReports(rows, positions).hmPreferences;
    expect(h.decided.base).toMatchObject({ n: 2, hits: 1, rate: 50 });
    expect(h.ratings.find((x) => x.criterion === 'technicalFit')).toMatchObject({
      strong: 2,
      moderate: 1,
      gap: 1,
      total: 4,
    });
    expect(h.reasons).toEqual([{ code: 'Too junior', count: 1 }]);
  });

  it('describes the hires and compares reviewed analyses of hires with the others', () => {
    const rows = [
      entry({
        hired: true,
        seniority: 'Director',
        criteria: { coreCompetencies: 'strong' } as never,
      }),
      entry({
        hired: true,
        seniority: 'Director',
        criteria: { coreCompetencies: 'partial' } as never,
      }),
      entry({ hired: false, criteria: { coreCompetencies: 'strong' } as never }),
      entry({ hired: false, criteria: null }),
    ];
    const h = buildPatternReports(rows, positions).hireCharacteristics;
    expect(h.hires).toBe(2);
    expect(h.seniority[0]).toMatchObject({ label: 'Director', n: 2 });
    const core = h.criteria.find((c) => c.criterion === 'coreCompetencies')!;
    expect(core.hires).toMatchObject({ n: 2, hits: 1 });
    expect(core.others).toMatchObject({ n: 1, hits: 1 });
  });

  it('withholds a value that names a protected characteristic and counts it', () => {
    const rows = [
      entry({ skills: ['TypeScript', 'Young professionals network'] }),
      entry({ exit: { stage: 'contacting', reasonCode: 'Too old for the team' } }),
    ];
    const r = buildPatternReports(rows, positions);
    const every = JSON.stringify(r);
    expect(every).not.toMatch(/young|too old/i);
    expect(r.withheld.values).toBeGreaterThanOrEqual(2);
  });
});
