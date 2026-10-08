// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { MATCH_WEIGHT_KEYS } from '../schemas/settings';
import { FEEDBACK_CRITERIA, type FeedbackCriterion } from '../schemas/interviews';
import { experienceBand, isSmallSample, mentionsProtected } from './guardrails';

/**
 * Pattern reports for the seven questions of brief 14 (FR-KNW-02). Pure functions over plain facts
 * about each candidate-in-a-position, so the arithmetic is tested without a database. Every number
 * comes with the count of records it was computed from and with references to those records, and
 * every row carries a "few records" flag. Nothing here decides, ranks or recommends: it describes
 * what the agency's own records show.
 */

export const PATTERN_QUESTIONS = [
  'interviewProfiles',
  'hireProfiles',
  'sources',
  'jdResponse',
  'dropOff',
  'hmPreferences',
  'hireCharacteristics',
] as const;
export type PatternQuestion = (typeof PATTERN_QUESTIONS)[number];

/** How a hiring manager decided on a submitted candidate: moved to interview, or turned down after submission. */
export type HmOutcome = 'advanced' | 'declined';

export type CriterionLevel = 'strong' | 'partial' | 'gap' | 'unknown';

/** What the reports need to know about one candidate in one position. Built by `server/knowledge/facts.ts`. */
export interface EntryFact {
  entryId: string;
  positionId: string;
  clientId: string;
  /** Job-related characteristics only (see PATTERN_DIMENSIONS). */
  seniority: string | null;
  yearsExperience: number | null;
  skills: string[];
  source: string;
  submitted: boolean;
  interviewed: boolean;
  offered: boolean;
  hired: boolean;
  contacted: boolean;
  /** The candidate answered the outreach, whatever the answer. */
  responded: boolean;
  decision: HmOutcome | null;
  /** Where the candidate left the process without a hire, and the agency's reason code if one was recorded. */
  exit: { stage: string; reasonCode: string | null } | null;
  /** The hiring manager's ratings, counted per criterion over all rounds. */
  feedback: Partial<
    Record<FeedbackCriterion, Partial<Record<'strong' | 'moderate' | 'gap', number>>>
  >;
  /** Levels of the recruiter-reviewed match analysis, when there is one. */
  criteria: Partial<Record<(typeof MATCH_WEIGHT_KEYS)[number], CriterionLevel>> | null;
}

export interface PositionFact {
  positionId: string;
  title: string;
  clientId: string;
  workArrangement: string | null;
  /** The position states a pay range. */
  statesPay: boolean;
}

export interface EntryRef {
  entryId: string;
  positionId: string;
}

/** References kept per row: enough to open the records, short enough to store. */
export const MAX_REFS = 40;

/** One row: `hits` of `n` records, with the records themselves behind it. */
export interface RateRow {
  label: string;
  n: number;
  hits: number;
  /** Whole percent, or null when n is 0. */
  rate: number | null;
  /** Fewer records than MIN_SAMPLE. */
  small: boolean;
  /** The records the n comes from (first MAX_REFS). */
  refs: EntryRef[];
  refCount: number;
}

const percent = (hits: number, n: number): number | null =>
  n === 0 ? null : Math.round((hits / n) * 100);

const refsOf = (entries: EntryFact[]): EntryRef[] =>
  entries.slice(0, MAX_REFS).map((e) => ({ entryId: e.entryId, positionId: e.positionId }));

function row(label: string, group: EntryFact[], hit: (e: EntryFact) => boolean): RateRow {
  const hits = group.filter(hit).length;
  return {
    label,
    n: group.length,
    hits,
    rate: percent(hits, group.length),
    small: isSmallSample(group.length),
    refs: refsOf(group),
    refCount: group.length,
  };
}

export type DimensionName = 'seniority' | 'experience' | 'skill' | 'source';
const NOT_STATED = 'Not stated';
const MAX_SKILL_ROWS = 12;

/** The values of a dimension for one record; a record can have several skills and one of the rest. */
function valuesOf(e: EntryFact, dimension: DimensionName): string[] {
  switch (dimension) {
    case 'seniority':
      return [e.seniority ?? NOT_STATED];
    case 'experience':
      return [experienceBand(e.yearsExperience) ?? NOT_STATED];
    case 'source':
      return [e.source];
    case 'skill':
      return [...new Set(e.skills.map((s) => s.trim()).filter(Boolean))];
  }
}

export interface Withheld {
  /** Values left out because they name a protected characteristic. */
  values: number;
}

/**
 * Groups records by a dimension and counts hits. Rows come out largest group first; skills are cut
 * to the most common. Values that name a protected characteristic are withheld and counted.
 */
function byDimension(
  entries: EntryFact[],
  dimension: DimensionName,
  hit: (e: EntryFact) => boolean,
  withheld: Withheld,
): RateRow[] {
  const groups = new Map<string, EntryFact[]>();
  for (const e of entries)
    for (const value of valuesOf(e, dimension)) {
      if (mentionsProtected(value)) {
        withheld.values += 1;
        continue;
      }
      groups.set(value, [...(groups.get(value) ?? []), e]);
    }
  const rows = [...groups].map(([label, group]) => row(label, group, hit));
  rows.sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  return dimension === 'skill' ? rows.slice(0, MAX_SKILL_ROWS) : rows;
}

export interface ProfileReport {
  /** All records the question is asked about. */
  base: RateRow;
  seniority: RateRow[];
  experience: RateRow[];
  skill: RateRow[];
  source: RateRow[];
}

function profileReport(
  entries: EntryFact[],
  hit: (e: EntryFact) => boolean,
  label: string,
  withheld: Withheld,
): ProfileReport {
  return {
    base: row(label, entries, hit),
    seniority: byDimension(entries, 'seniority', hit, withheld),
    experience: byDimension(entries, 'experience', hit, withheld),
    skill: byDimension(entries, 'skill', hit, withheld),
    source: byDimension(entries, 'source', hit, withheld),
  };
}

export interface SourceRow {
  source: string;
  added: number;
  contacted: number;
  submitted: number;
  interviewed: number;
  hired: number;
  /** Interviewed ÷ submitted: of what this source sent forward, how much the hiring managers wanted to meet. */
  qualityRate: number | null;
  small: boolean;
  refs: EntryRef[];
  refCount: number;
}

export interface JdResponseRow extends RateRow {
  positionId: string;
  workArrangement: string | null;
  statesPay: boolean;
}

export interface DropOffRow {
  stage: string;
  count: number;
  /** Share of all records that left (whole percent). */
  share: number | null;
  small: boolean;
  reasons: { code: string; count: number }[];
  refs: EntryRef[];
  refCount: number;
}

export interface CriterionRow {
  criterion: (typeof MATCH_WEIGHT_KEYS)[number];
  /** Among hires with a reviewed analysis: how many were strong on this criterion. */
  hires: RateRow;
  /** Among submitted candidates who were not hired and have a reviewed analysis. */
  others: RateRow;
}

export interface PatternReports {
  entries: number;
  positions: number;
  withheld: Withheld;
  interviewProfiles: ProfileReport;
  hireProfiles: ProfileReport;
  sources: SourceRow[];
  jdResponse: {
    byPosition: JdResponseRow[];
    byArrangement: RateRow[];
    byPay: RateRow[];
  };
  dropOff: { left: number; rows: DropOffRow[] };
  hmPreferences: {
    decided: ProfileReport;
    ratings: {
      criterion: FeedbackCriterion;
      strong: number;
      moderate: number;
      gap: number;
      total: number;
      small: boolean;
    }[];
    reasons: { code: string; count: number }[];
  };
  hireCharacteristics: {
    hires: number;
    seniority: RateRow[];
    experience: RateRow[];
    skill: RateRow[];
    source: RateRow[];
    criteria: CriterionRow[];
  };
}

const MAX_JD_ROWS = 15;

/** Counts of strings, biggest first, protected-looking ones withheld. */
function tally(values: string[], withheld: Withheld): { code: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (mentionsProtected(v)) {
      withheld.values += 1;
      continue;
    }
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Builds the seven reports for the given records. */
export function buildPatternReports(
  entries: EntryFact[],
  positions: PositionFact[],
): PatternReports {
  const withheld: Withheld = { values: 0 };
  const submitted = entries.filter((e) => e.submitted);

  // Q1, Q2: which profiles reach an interview, which reach a hire (of those submitted).
  const interviewProfiles = profileReport(
    submitted,
    (e) => e.interviewed,
    'All submitted',
    withheld,
  );
  const hireProfiles = profileReport(submitted, (e) => e.hired, 'All submitted', withheld);

  // Q3: which sources bring candidates the hiring managers want to meet.
  const sourceNames = [...new Set(entries.map((e) => e.source))].sort();
  const sources: SourceRow[] = sourceNames.map((source) => {
    const group = entries.filter((e) => e.source === source);
    const sent = group.filter((e) => e.submitted);
    return {
      source,
      added: group.length,
      contacted: group.filter((e) => e.contacted).length,
      submitted: sent.length,
      interviewed: sent.filter((e) => e.interviewed).length,
      hired: sent.filter((e) => e.hired).length,
      qualityRate: percent(sent.filter((e) => e.interviewed).length, sent.length),
      small: isSmallSample(sent.length),
      refs: refsOf(group),
      refCount: group.length,
    };
  });

  // Q4: which JDs get a response. Per position, and by the traits of the position itself.
  const byPosition: JdResponseRow[] = positions
    .map((p) => {
      const contacted = entries.filter((e) => e.positionId === p.positionId && e.contacted);
      return {
        ...row(p.title, contacted, (e) => e.responded),
        positionId: p.positionId,
        workArrangement: p.workArrangement,
        statesPay: p.statesPay,
      };
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, MAX_JD_ROWS);
  const contactedBy = (pick: (p: PositionFact) => string) => {
    const groups = new Map<string, EntryFact[]>();
    const traitOf = new Map(positions.map((p) => [p.positionId, pick(p)]));
    for (const e of entries.filter((x) => x.contacted)) {
      const trait = traitOf.get(e.positionId);
      if (trait) groups.set(trait, [...(groups.get(trait) ?? []), e]);
    }
    return [...groups]
      .map(([label, group]) => row(label, group, (e) => e.responded))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  };

  // Q5: where do candidates leave, and why.
  const left = entries.filter((e) => e.exit);
  const stages = [...new Set(left.map((e) => e.exit!.stage))];
  const dropRows: DropOffRow[] = stages
    .map((stage) => {
      const group = left.filter((e) => e.exit!.stage === stage);
      return {
        stage,
        count: group.length,
        share: percent(group.length, left.length),
        small: isSmallSample(group.length),
        reasons: tally(
          group.flatMap((e) => (e.exit!.reasonCode ? [e.exit!.reasonCode] : [])),
          withheld,
        ),
        refs: refsOf(group),
        refCount: group.length,
      };
    })
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));

  // Q6: what the hiring managers actually prefer: who they moved to interview, and how they rate.
  const decided = submitted.filter((e) => e.decision !== null);
  const ratings = FEEDBACK_CRITERIA.map((criterion) => {
    const counts = { strong: 0, moderate: 0, gap: 0 };
    for (const e of entries) {
      const c = e.feedback[criterion];
      counts.strong += c?.strong ?? 0;
      counts.moderate += c?.moderate ?? 0;
      counts.gap += c?.gap ?? 0;
    }
    const total = counts.strong + counts.moderate + counts.gap;
    return { criterion, ...counts, total, small: isSmallSample(total) };
  });
  const declineReasons = tally(
    entries.flatMap((e) =>
      e.decision === 'declined' && e.exit?.reasonCode ? [e.exit.reasonCode] : [],
    ),
    withheld,
  );

  // Q7: which job-related characteristics go with the hires.
  const hires = entries.filter((e) => e.hired);
  const hitAlways = () => true;
  const hireCriteria: CriterionRow[] = MATCH_WEIGHT_KEYS.map((criterion) => {
    const strong = (e: EntryFact) => e.criteria?.[criterion] === 'strong';
    const reviewed = (e: EntryFact) => e.criteria !== null;
    return {
      criterion,
      hires: row(criterion, hires.filter(reviewed), strong),
      others: row(
        criterion,
        submitted.filter((e) => !e.hired && reviewed(e)),
        strong,
      ),
    };
  });

  return {
    entries: entries.length,
    positions: new Set(entries.map((e) => e.positionId)).size,
    withheld,
    interviewProfiles,
    hireProfiles,
    sources,
    jdResponse: {
      byPosition,
      byArrangement: contactedBy((p) => p.workArrangement ?? NOT_STATED),
      byPay: contactedBy((p) => (p.statesPay ? 'Pay range stated' : 'No pay range')),
    },
    dropOff: { left: left.length, rows: dropRows },
    hmPreferences: {
      decided: profileReport(decided, (e) => e.decision === 'advanced', 'Decided', withheld),
      ratings,
      reasons: declineReasons,
    },
    hireCharacteristics: {
      hires: hires.length,
      seniority: byDimension(hires, 'seniority', hitAlways, withheld),
      experience: byDimension(hires, 'experience', hitAlways, withheld),
      skill: byDimension(hires, 'skill', hitAlways, withheld),
      source: byDimension(hires, 'source', hitAlways, withheld),
      criteria: hireCriteria,
    },
  };
}
