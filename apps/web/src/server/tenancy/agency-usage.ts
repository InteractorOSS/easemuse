// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { withAgency } from '@/lib/db';
import { getBudgetStatus, type BudgetStatus } from '@/server/ai/ledger';
import { getPlatformUsage, type UsageRow } from '@/server/platform/usage';

export const monthQuerySchema = z.object({
  /** `YYYY-MM`; defaults to the current month (UTC). */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
    .optional(),
});

export interface AgencyUsage {
  month: string;
  budget: BudgetStatus;
  byPurpose: UsageRow[];
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
}

/** UTC start (inclusive) and end (exclusive) of a month, as `YYYY-MM`. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/**
 * This month's AI use for the agency admin (US-1304): cost by purpose against the budget, with the
 * 80% and 100% levels the budget gate uses. Reads only the agency in scope.
 */
export async function getAgencyUsage(
  agencyId: string,
  month?: string,
  now: Date = new Date(),
): Promise<AgencyUsage> {
  const label = month ?? now.toISOString().slice(0, 7);
  const { from, to } = monthRange(label);
  const [byPurpose, budget] = await Promise.all([
    getPlatformUsage({ from, to, agencyId, groupBy: 'purpose' }),
    withAgency(agencyId, (tx) =>
      getBudgetStatus(tx, agencyId, to > now ? now : new Date(to.getTime() - 1)),
    ),
  ]);
  const totals = byPurpose.reduce(
    (t, r) => ({
      calls: t.calls + r.calls,
      inputTokens: t.inputTokens + r.inputTokens,
      outputTokens: t.outputTokens + r.outputTokens,
      costUsd: t.costUsd + r.costUsd,
    }),
    { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
  return {
    month: label,
    budget,
    byPurpose,
    totals: { ...totals, costUsd: Math.round(totals.costUsd * 1_000_000) / 1_000_000 },
  };
}
