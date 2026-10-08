// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { visibilityFilter } from '@/server/positions/service';
import { type AnalyticsQuery, type CsvTable } from './query';
import {
  computeCapacity,
  computeKpis,
  computeSources,
  type Capacity,
  type Duration,
  type EntryFacts,
  type Kpis,
  type PositionFacts,
  type RecruiterCapacity,
  type Rate,
  type SourceRow,
} from './compute';

const DAY_MS = 86_400_000;
/** The longest period one request may cover. */
const MAX_DAYS = 731;
/** The default period: the last 90 days, today included. */
const DEFAULT_DAYS = 90;

export interface AnalyticsView {
  /** The period shown, as inclusive days. */
  range: { from: string; to: string };
  filters: { clientId: string | null; positionId: string | null; ownerId: string | null };
  kpis: Kpis;
  sources: SourceRow[];
  capacity: Omit<Capacity, 'recruiters'> & {
    recruiters: (RecruiterCapacity & { name: string })[];
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The period from the query: inclusive days in, a half-open UTC interval out. */
export function resolvePeriod(
  query: Pick<AnalyticsQuery, 'from' | 'to'>,
  now: Date = new Date(),
): { from: Date; to: Date } {
  const lastDay = query.to
    ? new Date(`${query.to}T00:00:00.000Z`)
    : new Date(`${day(now)}T00:00:00.000Z`);
  const to = new Date(lastDay.getTime() + DAY_MS);
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(to.getTime() - DEFAULT_DAYS * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ApiError('invalid_input', 'Not a valid date', { status: 422 });
  }
  if (from >= to) {
    throw new ApiError('invalid_input', 'The start date must be on or before the end date', {
      status: 422,
      fields: { from: 'After the end date' },
    });
  }
  if ((to.getTime() - from.getTime()) / DAY_MS > MAX_DAYS) {
    throw new ApiError('invalid_input', 'Choose a period of two years or less', {
      status: 422,
      fields: { from: 'Period too long' },
    });
  }
  return { from, to };
}

/**
 * Recruiting analytics for the agency (brief §13, US-1101, FR-ANA-01..03). Only positions the actor
 * may see count (the agency's visibility rule), so a recruiter who sees only their own positions
 * sees only their own numbers.
 */
export async function getAnalytics(
  tx: ScopedTx,
  actor: AgencyActor,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<AnalyticsView> {
  const period = resolvePeriod(query, now);
  const positionRows = await tx.position.findMany({
    where: {
      AND: [
        await visibilityFilter(tx, actor),
        {
          ...(query.clientId ? { clientId: query.clientId } : {}),
          ...(query.positionId ? { id: query.positionId } : {}),
          ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        },
      ],
    },
    select: {
      id: true,
      ownerId: true,
      createdAt: true,
      transitions: {
        select: { toStatus: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  });
  const positions: PositionFacts[] = positionRows.map((p) => ({
    id: p.id,
    ownerId: p.ownerId,
    createdAt: p.createdAt,
    statusChanges: p.transitions.map((t) => ({ status: t.toStatus, at: t.createdAt })),
  }));
  const entryRows = positions.length
    ? await tx.pipelineEntry.findMany({
        where: { positionId: { in: positions.map((p) => p.id) } },
        select: {
          id: true,
          positionId: true,
          createdAt: true,
          candidate: { select: { source: true } },
          transitions: {
            select: { toState: true, createdAt: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
          touches: { select: { sentAt: true, response: true } },
          interviews: { select: { scheduledAt: true, createdAt: true, status: true } },
        },
      })
    : [];
  const entries: EntryFacts[] = entryRows.map((e) => ({
    id: e.id,
    positionId: e.positionId,
    source: e.candidate.source,
    createdAt: e.createdAt,
    transitions: e.transitions.map((t) => ({ toState: t.toState, at: t.createdAt })),
    touches: e.touches,
    interviews: e.interviews.map((i) => ({ at: i.scheduledAt ?? i.createdAt, status: i.status })),
  }));

  const capacity = computeCapacity(positions, period);
  const members = capacity.recruiters.length
    ? await tx.membership.findMany({
        where: { userId: { in: capacity.recruiters.map((r) => r.userId) } },
        select: { userId: true, user: { select: { name: true, email: true } } },
      })
    : [];
  const names = new Map(members.map((m) => [m.userId, m.user.name ?? m.user.email]));

  return {
    range: { from: day(period.from), to: day(new Date(period.to.getTime() - DAY_MS)) },
    filters: {
      clientId: query.clientId ?? null,
      positionId: query.positionId ?? null,
      ownerId: query.ownerId ?? null,
    },
    kpis: computeKpis(entries, positions, period),
    sources: computeSources(entries, period),
    capacity: {
      ...capacity,
      recruiters: capacity.recruiters.map((r) => ({ ...r, name: names.get(r.userId) ?? '' })),
    },
  };
}

const RATE_KPIS = [
  'outreachResponse',
  'submissionToInterview',
  'interviewToOffer',
  'offerAcceptance',
  'interviewToHire',
  'sourceToHire',
] as const;
const DURATION_KPIS = ['timeToFill', 'timeToInterview'] as const;

function cell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  // Spreadsheet formula injection: a leading =, +, - or @ is neutralised.
  const safe = /^[=+\-@]/.test(text) && typeof value === 'string' ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const rateCells = (r: Rate) => [r.value, r.numerator, r.denominator];
const durationCells = (d: Duration) => [d.medianDays, d.count];

/** One table of the view as CSV (US-1102, FR-ANA-04), with the same filters as the page. */
export function analyticsCsv(view: AnalyticsView, table: CsvTable): string {
  let rows: (string | number | null)[][];
  switch (table) {
    case 'kpis':
      rows = [
        ['kpi', 'value', 'numerator', 'denominator', 'median_days', 'count'],
        ...DURATION_KPIS.map((k) => [k, null, null, null, ...durationCells(view.kpis[k])]),
        ...RATE_KPIS.map((k) => [k, ...rateCells(view.kpis[k]), null, null]),
      ];
      break;
    case 'conversion':
      rows = [
        ['from', 'to', 'rate', 'numerator', 'denominator'],
        ...view.kpis.conversion.map((c) => [c.from, c.to, ...rateCells(c.rate)]),
      ];
      break;
    case 'sources':
      rows = [
        [
          'source',
          'added',
          'contacted',
          'submitted',
          'interviewed',
          'offered',
          'hired',
          'hire_rate',
        ],
        ...view.sources.map((s) => [
          s.source,
          s.added,
          s.contacted,
          s.submitted,
          s.interviewed,
          s.offered,
          s.hired,
          s.hireRate.value,
        ]),
      ];
      break;
    case 'capacity':
      rows = [
        ['recruiter', 'active_positions_per_week', 'filled', 'median_days_per_position'],
        ...view.capacity.recruiters.map((r) => [
          r.name,
          r.activePositionsPerWeek,
          r.filled,
          r.timePerPosition.medianDays,
        ]),
      ];
      break;
  }
  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
}
