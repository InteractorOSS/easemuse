// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { USAGE_GROUPS, type UsageGroup } from '@easemuse/core';
import { z } from 'zod';
import { getAgenciesByIds, listActiveAgencyIds, withAgency, type ScopedTx } from '@/lib/db';

export const usageQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    agencyId: z.guid().optional(),
    groupBy: z.enum(USAGE_GROUPS).default('agency'),
  })
  .refine((q) => q.from < q.to, { message: 'from must be before to', path: ['from'] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= 400 * 86_400_000, {
    message: 'Range is limited to 400 days',
    path: ['to'],
  });

export interface UsageRow {
  key: string;
  /** Agency name when grouped by agency. */
  label: string | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

type Totals = Omit<UsageRow, 'key' | 'label'>;
const zero = (): Totals => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  costUsd: 0,
});

/** One agency's LlmCall roll-up, read inside that agency's own scope (RLS); ids and counts only. */
async function rollUp(
  tx: ScopedTx,
  agencyId: string,
  input: { from: Date; to: Date; groupBy: UsageGroup },
): Promise<Map<string, Totals>> {
  const where = { agencyId, createdAt: { gte: input.from, lt: input.to } };
  const sums = {
    inputTokens: true,
    outputTokens: true,
    cachedTokens: true,
    costUsd: true,
  } as const;
  const out = new Map<string, Totals>();
  const add = (key: string, t: Totals) => {
    const cur = out.get(key) ?? zero();
    out.set(key, {
      calls: cur.calls + t.calls,
      inputTokens: cur.inputTokens + t.inputTokens,
      outputTokens: cur.outputTokens + t.outputTokens,
      cachedTokens: cur.cachedTokens + t.cachedTokens,
      costUsd: cur.costUsd + t.costUsd,
    });
  };

  if (input.groupBy === 'day') {
    const rows = await tx.$queryRaw<
      {
        key: string;
        calls: number;
        input: bigint | null;
        output: bigint | null;
        cached: bigint | null;
        cost: string | null;
      }[]
    >`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS key,
             count(*)::int AS calls, sum("inputTokens") AS input, sum("outputTokens") AS output,
             sum("cachedTokens") AS cached, sum("costUsd")::text AS cost
      FROM "LlmCall" WHERE "agencyId" = ${agencyId}::uuid AND "createdAt" >= ${input.from} AND "createdAt" < ${input.to}
      GROUP BY 1`;
    for (const r of rows) {
      add(r.key, {
        calls: r.calls,
        inputTokens: Number(r.input ?? 0),
        outputTokens: Number(r.output ?? 0),
        cachedTokens: Number(r.cached ?? 0),
        costUsd: Number(r.cost ?? 0),
      });
    }
    return out;
  }
  if (input.groupBy === 'agency') {
    const r = await tx.llmCall.aggregate({ where, _sum: sums, _count: { _all: true } });
    if (r._count._all > 0) {
      add(agencyId, {
        calls: r._count._all,
        inputTokens: r._sum.inputTokens ?? 0,
        outputTokens: r._sum.outputTokens ?? 0,
        cachedTokens: r._sum.cachedTokens ?? 0,
        costUsd: Number(r._sum.costUsd ?? 0),
      });
    }
    return out;
  }
  const by = input.groupBy === 'purpose' ? ('purpose' as const) : ('model' as const);
  const rows = await tx.llmCall.groupBy({ by: [by], where, _sum: sums, _count: { _all: true } });
  for (const r of rows) {
    add(r[by], {
      calls: r._count._all,
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      cachedTokens: r._sum.cachedTokens ?? 0,
      costUsd: Number(r._sum.costUsd ?? 0),
    });
  }
  return out;
}

const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/**
 * AI usage across agencies for /admin (US-1604, FR-ADM-05): cost and tokens by agency, purpose,
 * model or day. Each agency is read in its own RLS scope, a few at a time, so the platform never
 * gets a way around tenant isolation; only totals come back.
 */
export async function getPlatformUsage(
  input: z.output<typeof usageQuerySchema>,
  concurrency = 6,
): Promise<UsageRow[]> {
  const agencyIds = input.agencyId ? [input.agencyId] : await listActiveAgencyIds();
  const merged = new Map<string, Totals>();
  const queue = [...agencyIds];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      const part = await withAgency(id, (tx) => rollUp(tx, id, input));
      for (const [key, t] of part) {
        const cur = merged.get(key) ?? zero();
        merged.set(key, {
          calls: cur.calls + t.calls,
          inputTokens: cur.inputTokens + t.inputTokens,
          outputTokens: cur.outputTokens + t.outputTokens,
          cachedTokens: cur.cachedTokens + t.cachedTokens,
          costUsd: cur.costUsd + t.costUsd,
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(agencyIds.length, 1)) }, worker),
  );

  let labels = new Map<string, string>();
  if (input.groupBy === 'agency') {
    labels = new Map((await getAgenciesByIds([...merged.keys()])).map((a) => [a.id, a.name]));
  }
  const rows: UsageRow[] = [...merged].map(([key, t]) => ({
    key,
    label: labels.get(key) ?? null,
    ...t,
    costUsd: round(t.costUsd),
  }));
  return rows.sort((a, b) =>
    input.groupBy === 'day' ? a.key.localeCompare(b.key) : b.costUsd - a.costUsd,
  );
}
