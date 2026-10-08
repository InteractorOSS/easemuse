// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, AnalyticsQuery, AnalyticsTable } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { computeAdoption, loadAdoptionRows, type PortalAdoption } from './adoption';
import { computeCapacity, type CapacityRow } from './capacity';
import { toCsv } from './csv';
import {
  computeKpis,
  DAY_MS,
  sourceTable,
  stageFunnel,
  type EntryRow,
  type Kpis,
  type PositionRow,
  type Ratio,
  type SourceRow,
  type StageRow,
} from './kpis';

/** Most entries one request reads; a range with more is narrowed by the filters, never silently cut. */
const MAX_ENTRIES = 50_000;
const DEFAULT_DAYS = 90;

export interface AnalyticsResult {
  /** The range as applied, `YYYY-MM-DD`, both ends inclusive. */
  range: { from: string; to: string };
  /** The recruiter filter as applied: a recruiter always sees their own figures (brief §13: "their own"). */
  recruiterId: string | null;
  kpis: Kpis;
  /** Share of approvals, submission reviews and feedback done in the portals (T-14-08). */
  portalAdoption: PortalAdoption;
  stages: StageRow[];
  sources: SourceRow[];
  capacity: (CapacityRow & { name: string | null })[];
  /** People that can be picked in the recruiter filter (leads and admins only). */
  recruiters: { id: string; name: string }[];
  entryCount: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The applied range: inclusive days in, a half-open UTC interval out. */
export function resolveRange(query: AnalyticsQuery, now: Date = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const toDay = query.to ? new Date(`${query.to}T00:00:00Z`) : today;
  const fromDay = query.from
    ? new Date(`${query.from}T00:00:00Z`)
    : new Date(toDay.getTime() - (DEFAULT_DAYS - 1) * DAY_MS);
  return { from: fromDay, to: new Date(toDay.getTime() + DAY_MS) };
}

/**
 * Reads the rows the KPIs are computed from (T-11-01). Everything is read through the agency scope, so
 * another agency's data cannot appear whatever ids the filters name.
 */
export async function loadAnalyticsRows(
  tx: ScopedTx,
  filters: { from: Date; to: Date; clientId?: string; positionId?: string; recruiterId?: string },
): Promise<{ entries: EntryRow[]; positions: PositionRow[] }> {
  const entryRows = await tx.pipelineEntry.findMany({
    where: {
      createdAt: { gte: filters.from, lt: filters.to },
      ...(filters.positionId ? { positionId: filters.positionId } : {}),
      ...(filters.recruiterId ? { ownerId: filters.recruiterId } : {}),
      ...(filters.clientId ? { position: { clientId: filters.clientId } } : {}),
    },
    take: MAX_ENTRIES,
    select: {
      id: true,
      ownerId: true,
      positionId: true,
      createdAt: true,
      candidate: { select: { source: true } },
      transitions: { select: { toState: true, createdAt: true } },
      touches: { select: { status: true, response: true, sentAt: true, createdAt: true } },
      interviews: {
        where: { status: { not: 'cancelled' } },
        select: { scheduledAt: true, createdAt: true },
      },
      submissions: { select: { submittedAt: true } },
    },
  });
  const entries: EntryRow[] = entryRows.map((e) => ({
    id: e.id,
    ownerId: e.ownerId,
    positionId: e.positionId,
    source: e.candidate.source,
    createdAt: e.createdAt,
    transitions: e.transitions.map((t) => ({ toState: t.toState, at: t.createdAt })),
    touches: e.touches.map((t) => ({
      status: t.status,
      response: t.response,
      at: t.sentAt ?? t.createdAt,
    })),
    interviews: e.interviews.map((i) => ({ at: i.scheduledAt ?? i.createdAt })),
    submissions: e.submissions.map((s) => ({ at: s.submittedAt })),
  }));
  const positionRows = await tx.position.findMany({
    where: {
      ...(filters.positionId ? { id: filters.positionId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.recruiterId ? { ownerId: filters.recruiterId } : {}),
    },
    select: {
      id: true,
      ownerId: true,
      clientId: true,
      status: true,
      createdAt: true,
      transitions: { select: { toStatus: true, createdAt: true } },
    },
  });
  const positions: PositionRow[] = positionRows.map((p) => ({
    ...p,
    transitions: p.transitions.map((t) => ({ toStatus: t.toStatus, at: t.createdAt })),
  }));
  return { entries, positions };
}

/**
 * The analytics page's data (US-1101): the KPIs, the stage funnel, the source table and the capacity
 * panel for one range and filter set. A recruiter sees their own figures only; leads and admins see
 * the agency and may narrow by recruiter.
 */
export async function getAnalytics(
  tx: ScopedTx,
  actor: AgencyActor,
  query: AnalyticsQuery,
  now: Date = new Date(),
): Promise<AnalyticsResult> {
  const range = resolveRange(query, now);
  const recruiterId = actor.role === 'recruiter' ? actor.userId : (query.recruiterId ?? null);
  const { entries, positions } = await loadAnalyticsRows(tx, {
    ...range,
    clientId: query.clientId,
    positionId: query.positionId,
    recruiterId: recruiterId ?? undefined,
  });

  const portalAdoption = computeAdoption(
    await loadAdoptionRows(tx, {
      ...range,
      clientId: query.clientId,
      positionId: query.positionId,
      recruiterId: recruiterId ?? undefined,
    }),
  );

  const memberRows = await tx.membership.findMany({
    where: { active: true },
    select: { userId: true },
  });
  const users = await tx.user.findMany({
    where: { id: { in: memberRows.map((m) => m.userId) } },
    select: { id: true, name: true, email: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const capacity = computeCapacity(positions, range).map((row) => ({
    ...row,
    name: row.recruiterId ? (nameOf.get(row.recruiterId) ?? null) : null,
  }));

  return {
    range: { from: iso(range.from), to: iso(new Date(range.to.getTime() - DAY_MS)) },
    recruiterId,
    kpis: computeKpis(entries, positions, range),
    portalAdoption,
    stages: stageFunnel(entries),
    sources: sourceTable(entries),
    capacity,
    recruiters:
      actor.role === 'recruiter'
        ? []
        : users
            .map((u) => ({ id: u.id, name: u.name ?? u.email }))
            .sort((a, b) => a.name.localeCompare(b.name)),
    entryCount: entries.length,
  };
}

const pct = (r: Ratio) => (r.rate === null ? null : Math.round(r.rate * 1000) / 10);

/** Rows of one table for CSV, with the same filters as the page (FR-ANA-04). Figures are plain numbers. */
export function analyticsCsv(result: AnalyticsResult, table: AnalyticsTable): string {
  const k = result.kpis;
  switch (table) {
    case 'kpis':
      return toCsv(
        ['kpi', 'value', 'unit', 'numerator', 'denominator'],
        [
          ['time_to_fill', k.timeToFill.medianDays, 'median days', k.timeToFill.count, null],
          [
            'time_to_interview',
            k.timeToInterview.medianDays,
            'median days',
            k.timeToInterview.count,
            null,
          ],
          ...(
            [
              ['outreach_response_rate', k.outreachResponseRate],
              ['submission_to_interview', k.submissionToInterview],
              ['interview_to_offer', k.interviewToOffer],
              ['offer_acceptance_rate', k.offerAcceptance],
              ['interview_to_hire', k.interviewToHire],
              ['source_to_hire', k.sourceToHire],
              ['portal_adoption', result.portalAdoption.overall],
            ] as const
          ).map(([name, r]) => [name, pct(r), 'percent', r.numerator, r.denominator]),
        ],
      );
    case 'stages':
      return toCsv(
        ['stage', 'reached', 'conversion_from_previous_percent'],
        result.stages.map((s) => [s.stage, s.reached, s.conversion ? pct(s.conversion) : null]),
      );
    case 'sources':
      return toCsv(
        [
          'source',
          'added',
          'contacted',
          'submitted',
          'interviewed',
          'offered',
          'hired',
          'contacted_of_added_percent',
          'submitted_of_contacted_percent',
          'interviewed_of_submitted_percent',
          'offered_of_interviewed_percent',
          'hired_of_offered_percent',
          'source_to_hire_percent',
        ],
        result.sources.map((s) => [
          s.source,
          s.added,
          s.contacted,
          s.submitted,
          s.interviewed,
          s.offered,
          s.hired,
          pct(s.conversions.contacted),
          pct(s.conversions.submitted),
          pct(s.conversions.interviewed),
          pct(s.conversions.offered),
          pct(s.conversions.hired),
          pct(s.sourceToHire),
        ]),
      );
    case 'capacity':
      return toCsv(
        [
          'recruiter',
          'positions_per_week',
          'weeks',
          'median_active_days_per_position',
          'positions_filled',
        ],
        result.capacity.map((c) => [
          c.recruiterId === null ? 'everyone' : (c.name ?? c.recruiterId),
          c.positionsPerWeek,
          c.weeks,
          c.timePerPosition.medianDays,
          c.timePerPosition.count,
        ]),
      );
  }
}
