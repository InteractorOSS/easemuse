// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// JobRun is a PLATFORM table (ids and status only, no candidate data; `agencyId` is null for system
// jobs), so it is read and written with the unscoped client, inside lib/db (ADR-001).
import { getDbHandle } from './client';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface JobRunRecord {
  id: string;
  agencyId: string | null;
  queue: string;
  name: string;
  requestedById: string | null;
  status: JobStatus;
  progress: unknown;
  error: string | null;
}

const SELECT = {
  id: true,
  agencyId: true,
  queue: true,
  name: true,
  requestedById: true,
  status: true,
  progress: true,
  error: true,
} as const;

/** Creates the JobRun, or returns the existing one for the same (queue, idempotencyKey). */
export async function createJobRunIfAbsent(input: {
  queue: string;
  name: string;
  idempotencyKey: string;
  agencyId: string | null;
  requestedById: string | null;
}): Promise<{ jobRun: JobRunRecord; created: boolean }> {
  const { prisma } = getDbHandle();
  const { count } = await prisma.jobRun.createMany({ data: [input], skipDuplicates: true });
  const jobRun = await prisma.jobRun.findUniqueOrThrow({
    where: { queue_idempotencyKey: { queue: input.queue, idempotencyKey: input.idempotencyKey } },
    select: SELECT,
  });
  return { jobRun: jobRun as JobRunRecord, created: count === 1 };
}

export async function getJobRun(id: string): Promise<JobRunRecord | null> {
  const { prisma } = getDbHandle();
  return (await prisma.jobRun.findUnique({ where: { id }, select: SELECT })) as JobRunRecord | null;
}

export async function updateJobRun(
  id: string,
  patch: { status?: JobStatus; progress?: unknown; error?: string | null },
): Promise<void> {
  const { prisma } = getDbHandle();
  await prisma.jobRun.update({
    where: { id },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.progress !== undefined ? { progress: patch.progress as object } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    },
  });
}

export interface JobHealth {
  /** Per queue: how many runs ended each way in the window, and what is waiting right now. */
  queues: {
    queue: string;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    oldestQueuedAt: Date | null;
  }[];
  /** Failed runs in the window per agency (null = system jobs). */
  failedByAgency: { agencyId: string | null; failed: number }[];
  /** The latest failed runs: ids and names only, never the error text. */
  recentFailed: {
    id: string;
    queue: string;
    name: string;
    agencyId: string | null;
    createdAt: Date;
  }[];
}

/**
 * Job queue health for /admin (T-16-01, FR-ADM-09): counts and ids only. `JobRun` is a platform
 * table, so the unscoped client reads it here; the error text and progress are never selected.
 */
export async function getJobHealth(since: Date, recentLimit = 20): Promise<JobHealth> {
  const { prisma } = getDbHandle();
  const [inWindow, waiting, oldest, failedByAgency, recentFailed] = await Promise.all([
    prisma.jobRun.groupBy({
      by: ['queue', 'status'],
      where: { createdAt: { gte: since }, status: { in: ['succeeded', 'failed'] } },
      _count: { _all: true },
    }),
    prisma.jobRun.groupBy({
      by: ['queue', 'status'],
      where: { status: { in: ['queued', 'running'] } },
      _count: { _all: true },
    }),
    prisma.jobRun.groupBy({
      by: ['queue'],
      where: { status: 'queued' },
      _min: { createdAt: true },
    }),
    prisma.jobRun.groupBy({
      by: ['agencyId'],
      where: { createdAt: { gte: since }, status: 'failed' },
      _count: { _all: true },
    }),
    prisma.jobRun.findMany({
      where: { createdAt: { gte: since }, status: 'failed' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: recentLimit,
      select: { id: true, queue: true, name: true, agencyId: true, createdAt: true },
    }),
  ]);
  const queues = new Map<string, JobHealth['queues'][number]>();
  const row = (queue: string) => {
    let existing = queues.get(queue);
    if (!existing) {
      existing = { queue, queued: 0, running: 0, succeeded: 0, failed: 0, oldestQueuedAt: null };
      queues.set(queue, existing);
    }
    return existing;
  };
  for (const g of inWindow) row(g.queue)[g.status as 'succeeded' | 'failed'] = g._count._all;
  for (const g of waiting) row(g.queue)[g.status as 'queued' | 'running'] = g._count._all;
  for (const g of oldest) row(g.queue).oldestQueuedAt = g._min.createdAt;
  return {
    queues: [...queues.values()].sort((a, b) => a.queue.localeCompare(b.queue)),
    failedByAgency: failedByAgency.map((g) => ({ agencyId: g.agencyId, failed: g._count._all })),
    recentFailed,
  };
}
