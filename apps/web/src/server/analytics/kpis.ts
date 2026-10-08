// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * The KPI calculations of brief §13 (T-11-01, T-11-02), as pure functions over plain rows so the
 * formulas can be tested on a seeded history. Formulas follow planning-handoff §6; the choices the
 * brief left open are in implementation-notes.md (#13 to #16).
 *
 * Rate KPIs use one cohort: the pipeline entries ADDED to a position in the selected range. "Reached
 * a stage" means the entry has a transition into that stage or into a later one, so a skipped step
 * (an override) does not break a funnel.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The funnel, in order. `sourced` is where every entry starts. */
export const FUNNEL = [
  'sourced',
  'screened',
  'contacting',
  'interested',
  'qualified',
  'submitted',
  'interviewing',
  'offer',
  'accepted',
  'started',
] as const;
export type FunnelStage = (typeof FUNNEL)[number];

/** Which funnel stage a pipeline state counts as having reached; branch states that say nothing are left out. */
const REACHED: Record<string, FunnelStage> = {
  sourced: 'sourced',
  reviewed: 'sourced',
  screened: 'screened',
  contacting: 'contacting',
  no_response: 'contacting',
  not_interested: 'contacting',
  interested: 'interested',
  qualified: 'qualified',
  resume_ready: 'qualified',
  candidate_approved: 'qualified',
  submitted: 'submitted',
  client_rejected: 'submitted',
  interviewing: 'interviewing',
  offer: 'offer',
  declined: 'offer',
  accepted: 'accepted',
  reneged: 'accepted',
  started: 'started',
};
const rank = (stage: FunnelStage) => FUNNEL.indexOf(stage);

export interface EntryRow {
  id: string;
  ownerId: string;
  positionId: string;
  source: string;
  createdAt: Date;
  /** Every transition into a state, with its time. */
  transitions: { toState: string; at: Date }[];
  touches: { status: string; response: string | null; at: Date }[];
  /** Interviews that were not cancelled. */
  interviews: { at: Date }[];
  submissions: { at: Date }[];
}

export interface PositionRow {
  id: string;
  ownerId: string;
  clientId: string;
  status: string;
  createdAt: Date;
  transitions: { toStatus: string; at: Date }[];
}

/** An outreach response that counts as a reply (`no_response` does not). */
const REPLIES = new Set(['interested', 'not_interested', 'not_now', 'referred']);

export interface Ratio {
  numerator: number;
  denominator: number;
  /** 0..1, or null when the denominator is 0 (shown as "no data", never as 0%). */
  rate: number | null;
}
export interface DurationStat {
  count: number;
  medianDays: number | null;
}

export const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
const roundDays = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
export const duration = (days: number[]): DurationStat => ({
  count: days.length,
  medianDays: roundDays(median(days)),
});

/** First time the entry reached `stage` or a later one, or null. `sourced` is the creation time. */
export function reachedAt(entry: EntryRow, stage: FunnelStage): Date | null {
  const need = rank(stage);
  let first: Date | null = need === 0 ? entry.createdAt : null;
  const consider = (at: Date) => {
    if (!first || at < first) first = at;
  };
  for (const t of entry.transitions) {
    const stageReached = REACHED[t.toState];
    if (stageReached !== undefined && rank(stageReached) >= need) consider(t.at);
  }
  // A sent touch means the candidate was contacted, and an interview that was held means interviewing,
  // even when the state was never moved.
  if (need <= rank('contacting')) {
    for (const t of entry.touches) if (t.status === 'sent') consider(t.at);
  }
  if (need <= rank('interviewing')) {
    for (const i of entry.interviews) consider(i.at);
  }
  return first;
}
const reached = (entry: EntryRow, stage: FunnelStage) => reachedAt(entry, stage) !== null;
const interviewed = (entry: EntryRow) => entry.interviews.length > 0;

export interface Kpis {
  timeToFill: DurationStat;
  timeToInterview: DurationStat;
  outreachResponseRate: Ratio;
  submissionToInterview: Ratio;
  interviewToOffer: Ratio;
  offerAcceptance: Ratio;
  interviewToHire: Ratio;
  sourceToHire: Ratio;
}
export interface StageRow {
  stage: FunnelStage;
  reached: number;
  /** Share of the previous stage that reached this one; null for the first stage. */
  conversion: Ratio | null;
}
export interface SourceRow {
  source: string;
  added: number;
  contacted: number;
  submitted: number;
  interviewed: number;
  offered: number;
  hired: number;
  /** Stage-to-stage: contacted/added, submitted/contacted, interviewed/submitted, offered/interviewed, hired/offered. */
  conversions: {
    contacted: Ratio;
    submitted: Ratio;
    interviewed: Ratio;
    offered: Ratio;
    hired: Ratio;
  };
  sourceToHire: Ratio;
}

/** Candidate Conversion Rate: per stage, entries reaching stage N+1 ÷ entries reaching stage N. */
export function stageFunnel(entries: EntryRow[]): StageRow[] {
  return FUNNEL.map((stage, i) => {
    const count = entries.filter((e) => reached(e, stage)).length;
    const previous = i === 0 ? null : entries.filter((e) => reached(e, FUNNEL[i - 1]!)).length;
    return { stage, reached: count, conversion: previous === null ? null : ratio(count, previous) };
  });
}

/** The sources of brief §13, in its order; any other value is listed after them. */
export const SOURCE_ORDER = [
  'linkedin',
  'referral',
  'direct_sourcing',
  'database',
  'networking',
  'other',
] as const;

/** Source performance (FR-ANA-02): the funnel per candidate source. */
export function sourceTable(entries: EntryRow[]): SourceRow[] {
  const known: readonly string[] = SOURCE_ORDER;
  const sources = [
    ...SOURCE_ORDER,
    ...new Set(entries.map((e) => e.source).filter((s) => !known.includes(s))),
  ];
  return sources.map((source) => {
    const own = entries.filter((e) => e.source === source);
    const added = own.length;
    const contacted = own.filter((e) => reached(e, 'contacting')).length;
    const submitted = own.filter((e) => reached(e, 'submitted')).length;
    const interviewedN = own.filter(interviewed).length;
    const offered = own.filter((e) => reached(e, 'offer')).length;
    const hired = own.filter((e) => reached(e, 'started')).length;
    return {
      source,
      added,
      contacted,
      submitted,
      interviewed: interviewedN,
      offered,
      hired,
      conversions: {
        contacted: ratio(contacted, added),
        submitted: ratio(submitted, contacted),
        interviewed: ratio(interviewedN, submitted),
        offered: ratio(offered, interviewedN),
        hired: ratio(hired, offered),
      },
      sourceToHire: ratio(hired, added),
    };
  });
}

/** Days a filled position took: from sourcing (or creation) to the last time it became filled. */
export function timeToFill(position: PositionRow): { days: number; filledAt: Date } | null {
  if (position.status !== 'filled') return null;
  const filled = position.transitions.filter((t) => t.toStatus === 'filled');
  if (filled.length === 0) return null;
  const filledAt = filled.reduce((a, t) => (t.at > a ? t.at : a), filled[0]!.at);
  const sourcing = position.transitions
    .filter((t) => t.toStatus === 'sourcing')
    .reduce<Date | null>((a, t) => (a === null || t.at < a ? t.at : a), null);
  const start = sourcing ?? position.createdAt;
  return { days: Math.max(0, (filledAt.getTime() - start.getTime()) / DAY_MS), filledAt };
}

export function computeKpis(
  entries: EntryRow[],
  positions: PositionRow[],
  range: { from: Date; to: Date },
): Kpis {
  const fills = positions
    .map(timeToFill)
    .filter(
      (f): f is { days: number; filledAt: Date } =>
        f !== null && f.filledAt >= range.from && f.filledAt < range.to,
    );

  // Time-to-Interview: the first submission to the first interview that is not before it.
  const toInterview: number[] = [];
  for (const e of entries) {
    if (e.submissions.length === 0 || e.interviews.length === 0) continue;
    const submitted = Math.min(...e.submissions.map((s) => s.at.getTime()));
    const later = e.interviews.map((i) => i.at.getTime()).filter((t) => t >= submitted);
    if (later.length > 0) toInterview.push((Math.min(...later) - submitted) / DAY_MS);
  }

  const contacted = entries.filter((e) => e.touches.some((t) => t.status === 'sent'));
  const replied = contacted.filter((e) =>
    e.touches.some((t) => t.status === 'sent' && t.response !== null && REPLIES.has(t.response)),
  );
  const submitted = entries.filter((e) => reached(e, 'submitted'));
  const withInterview = entries.filter(interviewed);
  const offered = entries.filter((e) => reached(e, 'offer'));
  return {
    timeToFill: duration(fills.map((f) => f.days)),
    timeToInterview: duration(toInterview),
    outreachResponseRate: ratio(replied.length, contacted.length),
    submissionToInterview: ratio(submitted.filter(interviewed).length, submitted.length),
    interviewToOffer: ratio(
      withInterview.filter((e) => reached(e, 'offer')).length,
      withInterview.length,
    ),
    offerAcceptance: ratio(offered.filter((e) => reached(e, 'accepted')).length, offered.length),
    interviewToHire: ratio(
      withInterview.filter((e) => reached(e, 'started')).length,
      withInterview.length,
    ),
    sourceToHire: ratio(entries.filter((e) => reached(e, 'started')).length, entries.length),
  };
}
