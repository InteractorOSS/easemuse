// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * Recruiting analytics (brief §13, US-1101, FR-ANA-01..03): pure functions over plain facts, so the
 * formulas are tested without a database. The formulas are those of planning-handoff §6:
 *
 * - Rates follow a cohort: an entry counts in the denominator when its starting event falls in the
 *   period (first outreach sent, submitted, first interview, offer), and in the numerator when it
 *   reached the next step, whenever that happened.
 * - Times are medians in days, counted when the closing event falls in the period.
 * - "Hire" means the candidate started (brief §12: the recruiter's job runs to the start date).
 */

/** The steps a candidate passes through for one position, in order. */
export const FUNNEL = [
  'sourced',
  'contacted',
  'interested',
  'qualified',
  'submitted',
  'interviewing',
  'offer',
  'accepted',
  'started',
] as const;
export type FunnelStage = (typeof FUNNEL)[number];

/**
 * The funnel step a pipeline state proves was reached. A "no" at a step still proves the step before
 * it: "not interested" was contacted, "declined" had an offer, "reneged" had accepted. States that
 * prove nothing about how far the candidate got (rejected, on hold, withdrawn, closed) map to null.
 */
export function stageOf(state: string): FunnelStage | null {
  switch (state) {
    case 'sourced':
    case 'reviewed':
    case 'screened':
      return 'sourced';
    case 'contacting':
    case 'no_response':
    case 'not_interested':
      return 'contacted';
    case 'interested':
      return 'interested';
    case 'qualified':
    case 'resume_ready':
    case 'candidate_approved':
      return 'qualified';
    case 'submitted':
    case 'client_rejected':
      return 'submitted';
    case 'interviewing':
      return 'interviewing';
    case 'offer':
    case 'declined':
      return 'offer';
    case 'accepted':
    case 'reneged':
      return 'accepted';
    case 'started':
      return 'started';
    default:
      return null;
  }
}

/** What analytics needs to know about one candidate in one position. */
export interface EntryFacts {
  id: string;
  positionId: string;
  source: string;
  createdAt: Date;
  /** Pipeline state changes, oldest first. */
  transitions: { toState: string; at: Date }[];
  /** When outreach messages were sent (null when not sent), and the responses recorded. */
  touches: { sentAt: Date | null; response: string | null }[];
  /** Interviews with their date (or when they were recorded) and status. */
  interviews: { at: Date; status: string }[];
}

/** What analytics needs to know about one position. */
export interface PositionFacts {
  id: string;
  ownerId: string;
  createdAt: Date;
  /** Status changes, oldest first. A position starts as a draft when it is created. */
  statusChanges: { status: string; at: Date }[];
}

export interface Rate {
  numerator: number;
  denominator: number;
  /** numerator ÷ denominator, rounded to 4 places; null when nothing is in the denominator. */
  value: number | null;
}

export interface Duration {
  /** Median in days, one decimal; null when there is nothing to measure. */
  medianDays: number | null;
  count: number;
}

export interface Period {
  from: Date;
  /** Exclusive. */
  to: Date;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const ACTIVE_STATUSES = new Set(['sourcing', 'interviewing', 'offer']);
/** Responses that count as an answer; "no_response" does not. */
const ANSWERS = new Set(['interested', 'not_interested', 'not_now', 'referred']);

const inPeriod = (d: Date | null | undefined, p: Period): d is Date =>
  d !== null && d !== undefined && d >= p.from && d < p.to;

export function rate(numerator: number, denominator: number): Rate {
  return {
    numerator,
    denominator,
    value: denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000,
  };
}

export function median(days: number[]): Duration {
  if (days.length === 0) return { medianDays: null, count: 0 };
  const sorted = [...days].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return { medianDays: Math.round(value * 10) / 10, count: sorted.length };
}

const daysBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY_MS;

/** The derived milestones of one entry. */
export interface EntryMilestones {
  /** The first time each funnel step was reached (a skipped step counts as reached then too). */
  reached: Partial<Record<FunnelStage, Date>>;
  firstSentAt: Date | null;
  responded: boolean;
  firstInterviewAt: Date | null;
}

export function milestones(entry: EntryFacts): EntryMilestones {
  const reached: Partial<Record<FunnelStage, Date>> = { sourced: entry.createdAt };
  for (const t of entry.transitions) {
    const stage = stageOf(t.toState);
    if (!stage) continue;
    const upTo = FUNNEL.indexOf(stage);
    for (let i = 0; i <= upTo; i++) reached[FUNNEL[i]!] ??= t.at;
  }
  const sent = entry.touches.map((t) => t.sentAt).filter((d): d is Date => d !== null);
  // The first interview's own date (planning-handoff §6); the move to "interviewing" stands in only
  // when no interview was recorded.
  const interviewDates = entry.interviews.filter((i) => i.status !== 'cancelled').map((i) => i.at);
  if (interviewDates.length === 0 && reached.interviewing)
    interviewDates.push(reached.interviewing);
  const firstInterviewAt = interviewDates.length
    ? new Date(Math.min(...interviewDates.map((d) => d.getTime())))
    : null;
  return {
    reached,
    firstSentAt: sent.length ? new Date(Math.min(...sent.map((d) => d.getTime()))) : null,
    responded: entry.touches.some((t) => t.response !== null && ANSWERS.has(t.response)),
    firstInterviewAt,
  };
}

export interface Kpis {
  timeToFill: Duration;
  timeToInterview: Duration;
  outreachResponse: Rate;
  submissionToInterview: Rate;
  interviewToOffer: Rate;
  offerAcceptance: Rate;
  interviewToHire: Rate;
  sourceToHire: Rate;
  /** Step to next step, for every step of the funnel. */
  conversion: { from: FunnelStage; to: FunnelStage; rate: Rate }[];
}

/** A cohort rate: entries whose starting event is in the period, and how many went on. */
function cohort(
  all: EntryMilestones[],
  period: Period,
  start: (m: EntryMilestones) => Date | null | undefined,
  next: (m: EntryMilestones) => boolean,
): Rate {
  const inCohort = all.filter((m) => inPeriod(start(m), period));
  return rate(inCohort.filter(next).length, inCohort.length);
}

/** The first time each position had an accepted offer. */
function firstAcceptedByPosition(entries: EntryFacts[], ms: EntryMilestones[]): Map<string, Date> {
  const out = new Map<string, Date>();
  entries.forEach((e, i) => {
    const at = ms[i]!.reached.accepted;
    if (!at) return;
    const prev = out.get(e.positionId);
    if (!prev || at < prev) out.set(e.positionId, at);
  });
  return out;
}

/** When a position started being worked: its first move to sourcing, else when it was created. */
function sourcingStart(p: PositionFacts): Date {
  return p.statusChanges.find((c) => c.status === 'sourcing')?.at ?? p.createdAt;
}

export function computeKpis(
  entries: EntryFacts[],
  positions: PositionFacts[],
  period: Period,
): Kpis {
  const ms = entries.map(milestones);
  const accepted = firstAcceptedByPosition(entries, ms);
  const fill = positions.flatMap((p) => {
    const end = accepted.get(p.id);
    return inPeriod(end, period) ? [Math.max(0, daysBetween(sourcingStart(p), end))] : [];
  });
  const toInterview = ms.flatMap((m) =>
    inPeriod(m.firstInterviewAt, period) && m.reached.submitted
      ? [Math.max(0, daysBetween(m.reached.submitted, m.firstInterviewAt))]
      : [],
  );
  return {
    timeToFill: median(fill),
    timeToInterview: median(toInterview),
    outreachResponse: cohort(
      ms,
      period,
      (m) => m.firstSentAt,
      (m) => m.responded,
    ),
    submissionToInterview: cohort(
      ms,
      period,
      (m) => m.reached.submitted,
      (m) => m.firstInterviewAt !== null,
    ),
    interviewToOffer: cohort(
      ms,
      period,
      (m) => m.firstInterviewAt,
      (m) => Boolean(m.reached.offer),
    ),
    offerAcceptance: cohort(
      ms,
      period,
      (m) => m.reached.offer,
      (m) => Boolean(m.reached.accepted),
    ),
    interviewToHire: cohort(
      ms,
      period,
      (m) => m.firstInterviewAt,
      (m) => Boolean(m.reached.started),
    ),
    sourceToHire: cohort(
      ms,
      period,
      (m) => m.reached.sourced,
      (m) => Boolean(m.reached.started),
    ),
    conversion: FUNNEL.slice(0, -1).map((from, i) => {
      const to = FUNNEL[i + 1]!;
      return {
        from,
        to,
        rate: cohort(
          ms,
          period,
          (m) => m.reached[from],
          (m) => Boolean(m.reached[to]),
        ),
      };
    }),
  };
}

export interface SourceRow {
  source: string;
  added: number;
  contacted: number;
  submitted: number;
  interviewed: number;
  offered: number;
  hired: number;
  /** hired ÷ added. */
  hireRate: Rate;
}

/** Results by source (FR-ANA-02) for the candidates added in the period. */
export function computeSources(entries: EntryFacts[], period: Period): SourceRow[] {
  const rows = new Map<string, SourceRow>();
  entries.forEach((e) => {
    if (!inPeriod(e.createdAt, period)) return;
    const m = milestones(e);
    const row = rows.get(e.source) ?? {
      source: e.source,
      added: 0,
      contacted: 0,
      submitted: 0,
      interviewed: 0,
      offered: 0,
      hired: 0,
      hireRate: rate(0, 0),
    };
    row.added += 1;
    if (m.reached.contacted) row.contacted += 1;
    if (m.reached.submitted) row.submitted += 1;
    if (m.firstInterviewAt) row.interviewed += 1;
    if (m.reached.offer) row.offered += 1;
    if (m.reached.started) row.hired += 1;
    rows.set(e.source, row);
  });
  return [...rows.values()]
    .map((r) => ({ ...r, hireRate: rate(r.hired, r.added) }))
    .sort((a, b) => b.added - a.added || a.source.localeCompare(b.source));
}

export interface RecruiterCapacity {
  userId: string;
  /** Positions in sourcing, interviewing or offer, averaged over the weeks of the period. */
  activePositionsPerWeek: number;
  filled: number;
  timePerPosition: Duration;
}

export interface Capacity {
  weeks: number;
  /** The brief's measure of success (§1.1): positions one recruiter carries at a time. */
  activePositionsPerRecruiter: number | null;
  /** Days from first sourcing to filled, for positions filled in the period. */
  timePerPosition: Duration;
  recruiters: RecruiterCapacity[];
}

/** The intervals in which a position was being worked (sourcing, interviewing or offer). */
function activeIntervals(p: PositionFacts, end: Date): { from: Date; to: Date }[] {
  const out: { from: Date; to: Date }[] = [];
  let status = 'draft';
  let since = p.createdAt;
  for (const c of [...p.statusChanges, { status: '__end', at: end }]) {
    if (ACTIVE_STATUSES.has(status) && c.at > since) out.push({ from: since, to: c.at });
    status = c.status;
    since = c.at;
  }
  return out;
}

/** Capacity per recruiter (FR-ANA-03, DP-5). */
export function computeCapacity(positions: PositionFacts[], period: Period): Capacity {
  const weeks = Math.max(1, Math.ceil((period.to.getTime() - period.from.getTime()) / WEEK_MS));
  const byOwner = new Map<string, { weeksActive: number; filledDays: number[] }>();
  const allFilled: number[] = [];
  for (const p of positions) {
    const intervals = activeIntervals(p, period.to);
    let weeksActive = 0;
    for (let w = 0; w < weeks; w++) {
      const ws = period.from.getTime() + w * WEEK_MS;
      const we = Math.min(ws + WEEK_MS, period.to.getTime());
      if (intervals.some((i) => i.from.getTime() < we && i.to.getTime() > ws)) weeksActive += 1;
    }
    const filledAt = p.statusChanges.find((c) => c.status === 'filled')?.at;
    const owner = byOwner.get(p.ownerId) ?? { weeksActive: 0, filledDays: [] };
    owner.weeksActive += weeksActive;
    if (inPeriod(filledAt, period)) {
      const days = Math.max(0, daysBetween(sourcingStart(p), filledAt));
      owner.filledDays.push(days);
      allFilled.push(days);
    }
    if (weeksActive > 0 || owner.filledDays.length > 0 || byOwner.has(p.ownerId))
      byOwner.set(p.ownerId, owner);
  }
  const recruiters = [...byOwner.entries()]
    .filter(([, o]) => o.weeksActive > 0 || o.filledDays.length > 0)
    .map(([userId, o]) => ({
      userId,
      activePositionsPerWeek: Math.round((o.weeksActive / weeks) * 10) / 10,
      filled: o.filledDays.length,
      timePerPosition: median(o.filledDays),
    }))
    .sort((a, b) => b.activePositionsPerWeek - a.activePositionsPerWeek);
  const totalWeeksActive = recruiters.reduce((t, r) => t + r.activePositionsPerWeek * weeks, 0);
  return {
    weeks,
    activePositionsPerRecruiter: recruiters.length
      ? Math.round((totalWeeksActive / weeks / recruiters.length) * 10) / 10
      : null,
    timePerPosition: median(allFilled),
    recruiters,
  };
}
