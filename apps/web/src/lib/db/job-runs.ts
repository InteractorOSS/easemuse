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
