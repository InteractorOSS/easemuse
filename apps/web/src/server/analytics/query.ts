// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** Query parameters of the analytics page and its CSV export (kept apart from the service). */
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const analyticsQuerySchema = z.object({
  /** First day (UTC), inclusive. */
  from: isoDay.optional(),
  /** Last day (UTC), inclusive. */
  to: isoDay.optional(),
  clientId: z.guid().optional(),
  positionId: z.guid().optional(),
  /** The recruiter who owns the positions. */
  ownerId: z.guid().optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const CSV_TABLES = ['kpis', 'conversion', 'sources', 'capacity'] as const;
export type CsvTable = (typeof CSV_TABLES)[number];
export const exportQuerySchema = analyticsQuerySchema.extend({ table: z.enum(CSV_TABLES) });
