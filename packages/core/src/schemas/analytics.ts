// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** Tables the analytics page shows; each one can be exported as CSV (FR-ANA-04). */
export const ANALYTICS_TABLES = ['kpis', 'stages', 'sources', 'capacity'] as const;
export type AnalyticsTable = (typeof ANALYTICS_TABLES)[number];

/** Longest range one analytics request may cover. */
export const MAX_ANALYTICS_DAYS = 800;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/**
 * Filters of the analytics page and its CSV export (US-1101, FR-ANA-01): a date range (both ends
 * inclusive, UTC days), and optionally one client, one position and (leads and admins only) one
 * recruiter. Missing dates default to the last 90 days.
 */
export const analyticsQuerySchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    clientId: z.guid().optional(),
    positionId: z.guid().optional(),
    recruiterId: z.guid().optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'The start must not be after the end',
    path: ['from'],
  })
  .refine(
    (q) =>
      !q.from ||
      !q.to ||
      (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= MAX_ANALYTICS_DAYS,
    { message: `Use a range of at most ${MAX_ANALYTICS_DAYS} days`, path: ['to'] },
  );
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const analyticsExportQuerySchema = z
  .object({ table: z.enum(ANALYTICS_TABLES) })
  .and(analyticsQuerySchema);
