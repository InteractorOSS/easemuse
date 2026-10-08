// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { EnqueueInput } from '@/lib/queue/enqueue';

/**
 * Recurring jobs. Each runs once a day at or after `hourUtc`. Every worker checks the clock, and
 * the date in the idempotency key means only the first `enqueue` of the day creates the job, so
 * running several workers is safe (no leader election needed).
 */
export interface DailyJob {
  queue: EnqueueInput['queue'];
  name: string;
  hourUtc: number;
  /** Runs every N minutes (from `hourUtc` on) instead of once a day. */
  everyMinutes?: number;
}

export const DAILY_JOBS: readonly DailyJob[] = [
  { queue: 'maintenance', name: 'artifacts.orphan_report', hourUtc: 3 },
  // Usage out to Billing Server, plan state back (ADR-013). Does nothing while billing is not connected.
  { queue: 'maintenance', name: 'billing.report', hourUtc: 4 },
  // Indexes approved profiles that have no vector yet (ADR-008).
  { queue: 'maintenance', name: 'embeddings.catch_up', hourUtc: 4 },
  // Replies to outreach in connected mailboxes (T-5-12).
  { queue: 'maintenance', name: 'mailbox.sync_replies', hourUtc: 0, everyMinutes: 10 },
];

const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/** Jobs whose time has come today. */
export function dueJobs(now: Date, jobs: readonly DailyJob[] = DAILY_JOBS): DailyJob[] {
  return jobs.filter((job) => now.getUTCHours() >= job.hourUtc);
}

export function dailyIdempotencyKey(job: DailyJob, now: Date): string {
  if (job.everyMinutes) {
    return `${job.name}:${Math.floor(now.getTime() / (job.everyMinutes * 60_000))}`;
  }
  return `${job.name}:${dayKey(now)}`;
}

/** One scheduler pass: enqueue every due job (deduplicated by the day-stamped key). */
export async function scheduleTick(
  now: Date,
  enqueue: (input: EnqueueInput) => Promise<{ deduplicated: boolean }>,
  jobs: readonly DailyJob[] = DAILY_JOBS,
): Promise<{ name: string; deduplicated: boolean }[]> {
  const results: { name: string; deduplicated: boolean }[] = [];
  for (const job of dueJobs(now, jobs)) {
    const { deduplicated } = await enqueue({
      queue: job.queue,
      name: job.name,
      agencyId: null,
      requestedById: null,
      idempotencyKey: dailyIdempotencyKey(job, now),
    });
    results.push({ name: job.name, deduplicated });
  }
  return results;
}

/** Runs `scheduleTick` now and every `intervalMs`; returns a stop function. Errors are logged, not thrown. */
export function startScheduler(options: {
  enqueue: (input: EnqueueInput) => Promise<{ deduplicated: boolean }>;
  intervalMs?: number;
  now?: () => Date;
  log?: (message: string, data: Record<string, unknown>) => void;
}): () => void {
  const now = options.now ?? (() => new Date());
  const tick = () =>
    scheduleTick(now(), options.enqueue).catch((error: Error) =>
      options.log?.('scheduler.error', { error: error.message }),
    );
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? 5 * 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}
