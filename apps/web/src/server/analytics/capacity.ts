// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { DAY_MS, duration, timeToFill, type DurationStat, type PositionRow } from './kpis';

/**
 * Capacity panel (T-11-03, FR-ANA-03, DP-5): the measure of success is recruiter capacity, not AI
 * output. Positions per recruiter is a weekly average of the positions in sourcing, interviewing or
 * offer; time per position is the system proxy of planning-handoff §6 ("active days": the days a
 * filled position spent in those statuses, on hold excluded).
 */
export const ACTIVE_STATUSES: readonly string[] = ['sourcing', 'interviewing', 'offer'];
const WEEK_MS = 7 * DAY_MS;

export interface CapacityRow {
  /** The recruiter; `null` is the row for everyone together. */
  recruiterId: string | null;
  /** Average over the weeks of the range of positions active at the end of each week. */
  positionsPerWeek: number | null;
  weeks: number;
  /** Median active days of the positions filled in the range. */
  timePerPosition: DurationStat;
}

const statusAt = (p: PositionRow, at: Date): string | null => {
  let found: { status: string; at: Date } | null = null;
  for (const t of p.transitions) {
    if (t.at <= at && (!found || t.at >= found.at)) found = { status: t.toStatus, at: t.at };
  }
  return found?.status ?? null;
};

/** Days the position spent in an active status up to `until`. */
export function activeDays(p: PositionRow, until: Date): number {
  const ordered = [...p.transitions].sort((a, b) => a.at.getTime() - b.at.getTime());
  let ms = 0;
  ordered.forEach((t, i) => {
    if (!ACTIVE_STATUSES.includes(t.toStatus)) return;
    const end = Math.min(ordered[i + 1]?.at.getTime() ?? until.getTime(), until.getTime());
    ms += Math.max(0, end - t.at.getTime());
  });
  return ms / DAY_MS;
}

export function computeCapacity(
  positions: PositionRow[],
  range: { from: Date; to: Date },
): CapacityRow[] {
  const weeks = Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / WEEK_MS));
  const sample = Array.from(
    { length: weeks },
    (_, k) => new Date(Math.min(range.from.getTime() + (k + 1) * WEEK_MS, range.to.getTime()) - 1),
  );
  const row = (recruiterId: string | null, own: PositionRow[]): CapacityRow => {
    const perWeek = sample.map(
      (at) => own.filter((p) => ACTIVE_STATUSES.includes(statusAt(p, at) ?? '')).length,
    );
    const total = perWeek.reduce((a, b) => a + b, 0);
    const days = own.flatMap((p) => {
      const fill = timeToFill(p);
      return fill && fill.filledAt >= range.from && fill.filledAt < range.to
        ? [activeDays(p, fill.filledAt)]
        : [];
    });
    return {
      recruiterId,
      positionsPerWeek: own.length === 0 ? null : Math.round((total / weeks) * 100) / 100,
      weeks,
      timePerPosition: duration(days),
    };
  };
  const owners = [...new Set(positions.map((p) => p.ownerId))].sort();
  return [
    row(null, positions),
    ...owners.map((o) =>
      row(
        o,
        positions.filter((p) => p.ownerId === o),
      ),
    ),
  ];
}
