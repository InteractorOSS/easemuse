// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import {
  getAgenciesByIds,
  getJobHealth,
  listActiveAgencyIds,
  withAgency,
  type JobHealth,
} from '@/lib/db';

/**
 * System health for /admin (T-16-01, FR-ADM-09, US-1606): job queues and failures, outbox failures,
 * and AI error and refusal rates, per agency. Counts and ids only: no error text, no subject, no
 * address, no prompt, nothing a candidate or client wrote. Each agency is read in its own RLS scope.
 */
export const healthQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
});

/** Messages waiting this long without leaving the queue count as stuck. */
export const STUCK_AFTER_MS = 15 * 60_000;
/** An agency needs this many AI generations in the window before its rates are flagged. */
export const MIN_GENERATIONS_FOR_RATE = 5;
/** Above this share of failed (or refused) generations an agency is flagged. */
export const AI_RATE_WARNING = 0.2;

export interface AgencyHealth {
  agencyId: string;
  agencyName: string;
  jobsFailed: number;
  outbox: { failed: number; bounced: number; stuck: number };
  ai: {
    generations: number;
    errors: number;
    refusals: number;
    errorRate: number | null;
    refusalRate: number | null;
  };
  /** Anything in this row that needs a look: failed jobs or mail, stuck mail, or a high AI error or refusal rate. */
  needsAttention: boolean;
}

export interface HealthSnapshot {
  generatedAt: Date;
  hours: number;
  queues: JobHealth['queues'];
  failedJobs: (JobHealth['recentFailed'][number] & { agencyName: string | null })[];
  agencies: AgencyHealth[];
}

const REFUSED = 'ai_refused';

async function readAgency(agencyId: string, since: Date, now: Date) {
  return withAgency(agencyId, async (tx) => {
    const stuckBefore = new Date(now.getTime() - STUCK_AFTER_MS);
    const [byStatus, stuck, generations] = await Promise.all([
      tx.outboxMessage.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since }, status: { in: ['failed', 'bounced'] } },
        _count: { _all: true },
      }),
      tx.outboxMessage.count({
        where: { status: { in: ['queued', 'sending'] }, createdAt: { lt: stuckBefore } },
      }),
      tx.aiGeneration.groupBy({
        by: ['status', 'error'],
        where: { createdAt: { gte: since }, status: { in: ['succeeded', 'failed'] } },
        _count: { _all: true },
      }),
    ]);
    const count = (status: string) => byStatus.find((g) => g.status === status)?._count._all ?? 0;
    let total = 0;
    let errors = 0;
    let refusals = 0;
    for (const g of generations) {
      total += g._count._all;
      if (g.status === 'failed') {
        if (g.error === REFUSED) refusals += g._count._all;
        else errors += g._count._all;
      }
    }
    return {
      outbox: { failed: count('failed'), bounced: count('bounced'), stuck },
      generations: total,
      errors,
      refusals,
    };
  });
}

export async function getSystemHealth(
  input: z.output<typeof healthQuerySchema>,
  now: Date = new Date(),
  concurrency = 6,
): Promise<HealthSnapshot> {
  const since = new Date(now.getTime() - input.hours * 3_600_000);
  const [jobs, agencyIds] = await Promise.all([getJobHealth(since), listActiveAgencyIds()]);

  const parts = new Map<string, Awaited<ReturnType<typeof readAgency>>>();
  const queue = [...agencyIds];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(agencyIds.length, 1)) }, async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        parts.set(id, await readAgency(id, since, now));
      }
    }),
  );

  const names = new Map(
    (
      await getAgenciesByIds([
        ...agencyIds,
        ...jobs.recentFailed.flatMap((j) => (j.agencyId ? [j.agencyId] : [])),
      ])
    ).map((a) => [a.id, a.name]),
  );
  const jobFailures = new Map(jobs.failedByAgency.map((g) => [g.agencyId, g.failed]));

  const agencies: AgencyHealth[] = agencyIds.map((agencyId) => {
    const part = parts.get(agencyId)!;
    const rate = (n: number) => (part.generations > 0 ? n / part.generations : null);
    const enough = part.generations >= MIN_GENERATIONS_FOR_RATE;
    const jobsFailed = jobFailures.get(agencyId) ?? 0;
    const errorRate = rate(part.errors);
    const refusalRate = rate(part.refusals);
    return {
      agencyId,
      agencyName: names.get(agencyId) ?? agencyId,
      jobsFailed,
      outbox: part.outbox,
      ai: {
        generations: part.generations,
        errors: part.errors,
        refusals: part.refusals,
        errorRate,
        refusalRate,
      },
      needsAttention:
        jobsFailed > 0 ||
        part.outbox.failed > 0 ||
        part.outbox.bounced > 0 ||
        part.outbox.stuck > 0 ||
        (enough && ((errorRate ?? 0) > AI_RATE_WARNING || (refusalRate ?? 0) > AI_RATE_WARNING)),
    };
  });
  agencies.sort(
    (a, b) =>
      Number(b.needsAttention) - Number(a.needsAttention) ||
      a.agencyName.localeCompare(b.agencyName),
  );

  return {
    generatedAt: now,
    hours: input.hours,
    queues: jobs.queues,
    failedJobs: jobs.recentFailed.map((j) => ({
      ...j,
      agencyName: j.agencyId ? (names.get(j.agencyId) ?? null) : null,
    })),
    agencies,
  };
}
