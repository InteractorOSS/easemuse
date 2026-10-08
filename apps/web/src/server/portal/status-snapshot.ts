// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  parseAgencySettings,
  statusSnapshotSchema,
  type CandidateStatusStep,
  type StatusSnapshot,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';

/**
 * The candidate's own application status (T-15-01, FR-CDP-05, US-1505). Built from pipeline states
 * and interview counts only: never a rejection reason, a score, a client comment or anything about
 * another candidate. Kept free of imports from the pipeline service so the pipeline can refresh it
 * after every move without an import cycle.
 */

/** Pipeline states that mean "the client has the candidate" or later, mapped to what the candidate is told. */
const STEP_OF: Record<string, CandidateStatusStep> = {
  submitted: 'submitted',
  client_rejected: 'closed',
  interviewing: 'interviewing',
  rejected: 'closed',
  on_hold: 'on_hold',
  offer: 'offer',
  declined: 'closed',
  accepted: 'accepted',
  reneged: 'closed',
  started: 'started',
  withdrawn: 'closed',
  closed: 'closed',
};
/** The states that show the candidate was put forward; earlier ones are internal to the agency. */
const PUT_FORWARD = new Set([
  'submitted',
  'client_rejected',
  'interviewing',
  'rejected',
  'offer',
  'declined',
  'accepted',
  'reneged',
  'started',
]);
const MAX_APPLICATIONS = 20;

export async function buildStatusSnapshot(
  tx: ScopedTx,
  candidateId: string,
  level: 'basic' | 'detailed',
  now: Date,
): Promise<StatusSnapshot> {
  const entries = await tx.pipelineEntry.findMany({
    where: { candidateId },
    select: {
      state: true,
      position: { select: { title: true, client: { select: { name: true } } } },
      transitions: { select: { toState: true, createdAt: true } },
      interviews: { where: { status: { not: 'cancelled' } }, select: { id: true } },
    },
  });
  const rows = entries
    .filter((e) => e.transitions.some((t) => PUT_FORWARD.has(t.toState)))
    .flatMap((e) => {
      const step = STEP_OF[e.state];
      if (!step) return [];
      const last = e.transitions.reduce((a, t) => (t.createdAt > a ? t.createdAt : a), new Date(0));
      return [{ e, step, last }];
    })
    .sort((a, b) => b.last.getTime() - a.last.getTime())
    .slice(0, MAX_APPLICATIONS);
  return statusSnapshotSchema.parse({
    kind: 'status',
    level,
    applications: rows.map(({ e, step, last }) => ({
      positionTitle: e.position.title,
      clientName: level === 'detailed' ? e.position.client.name : null,
      step,
      since: level === 'detailed' ? last.toISOString().slice(0, 10) : null,
      interviews: level === 'detailed' ? e.interviews.length : null,
    })),
    publishedAt: now.toISOString(),
  });
}

/**
 * After a pipeline change: brings the candidate's active status share up to date, in place, and
 * withdraws it when the agency has since turned status sharing off. Does nothing for a candidate who
 * was never sent their status. The recruiter's act of sharing covers these updates; no email is sent.
 */
export async function refreshStatusShares(
  tx: ScopedTx,
  agencyId: string,
  candidateId: string,
  now: Date = new Date(),
): Promise<void> {
  const shares = await tx.portalShare.findMany({
    where: { kind: 'status', subjectId: candidateId, revokedAt: null },
    select: { id: true },
  });
  if (shares.length === 0) return;
  const agency = await tx.agency.findUnique({
    where: { id: agencyId },
    select: { settings: true },
  });
  const level = parseAgencySettings(agency?.settings).candidateStatusLevel;
  if (level === 'off') {
    await tx.portalShare.updateMany({
      where: { id: { in: shares.map((s) => s.id) } },
      data: { revokedAt: now },
    });
    return;
  }
  const snapshot = await buildStatusSnapshot(tx, candidateId, level, now);
  await tx.portalShare.updateMany({
    where: { id: { in: shares.map((s) => s.id) } },
    data: { snapshot: snapshot as never },
  });
}
