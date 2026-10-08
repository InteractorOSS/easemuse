// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import { ratio, type Ratio } from './kpis';

/**
 * Portal adoption (T-14-08, planning-handoff §6): approvals, submission reviews and interview
 * feedback done by hiring managers and candidates in the portals, divided by all of them, including
 * the ones the recruiter recorded on their behalf. It tells the agency whether the portals are
 * replacing email, nothing more: a recorded approval is just as valid as a portal one.
 */
export interface AdoptionRows {
  approvals: { source: string }[];
  feedback: { source: string }[];
  /** One row per submitted entry whose client decision fell in the range; `viaPortal` when the hiring manager proposed it in the portal. */
  reviews: { viaPortal: boolean }[];
}

export interface PortalAdoption {
  overall: Ratio;
  approvals: Ratio;
  reviews: Ratio;
  feedback: Ratio;
}

const portalShare = (rows: { source: string }[]) =>
  ratio(rows.filter((r) => r.source === 'portal').length, rows.length);

export function computeAdoption(rows: AdoptionRows): PortalAdoption {
  const approvals = portalShare(rows.approvals);
  const feedback = portalShare(rows.feedback);
  const reviews = ratio(rows.reviews.filter((r) => r.viaPortal).length, rows.reviews.length);
  return {
    approvals,
    reviews,
    feedback,
    overall: ratio(
      approvals.numerator + reviews.numerator + feedback.numerator,
      approvals.denominator + reviews.denominator + feedback.denominator,
    ),
  };
}

/** The client decisions that count as a submission review: the hiring manager's answer to a submitted candidate. */
const REVIEW_STATES = ['interviewing', 'client_rejected', 'on_hold'] as const;

export async function loadAdoptionRows(
  tx: ScopedTx,
  filters: { from: Date; to: Date; clientId?: string; positionId?: string; recruiterId?: string },
): Promise<AdoptionRows> {
  const positions = await tx.position.findMany({
    where: {
      ...(filters.positionId ? { id: filters.positionId } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.recruiterId ? { ownerId: filters.recruiterId } : {}),
    },
    select: { id: true },
  });
  const positionIds = positions.map((p) => p.id);
  const entries = await tx.pipelineEntry.findMany({
    where: {
      positionId: { in: positionIds },
      ...(filters.recruiterId ? { ownerId: filters.recruiterId } : {}),
    },
    select: { id: true },
  });
  const entryIds = entries.map((e) => e.id);
  const range = { gte: filters.from, lt: filters.to };

  const [approvals, feedback, decisions, proposals] = await Promise.all([
    tx.approval.findMany({
      where: {
        decidedAt: range,
        OR: [
          { subject: 'jd', subjectId: { in: positionIds } },
          { subject: 'tailored_resume', subjectId: { in: entryIds } },
        ],
      },
      select: { source: true },
    }),
    tx.interviewFeedback.findMany({
      where: { createdAt: range, interview: { entryId: { in: entryIds } } },
      select: { source: true },
    }),
    tx.pipelineTransition.findMany({
      where: {
        entryId: { in: entryIds },
        fromState: 'submitted',
        toState: { in: [...REVIEW_STATES] },
        createdAt: range,
      },
      select: { entryId: true },
    }),
    tx.proposedTransition.findMany({
      where: { entryId: { in: entryIds } },
      select: { entryId: true, createdAt: true },
    }),
  ]);

  // A decision came through the portal when the hiring manager proposed it; one entry is one review.
  const proposedEntries = new Set(proposals.map((p) => p.entryId));
  const reviewed = new Map<string, boolean>();
  for (const d of decisions) reviewed.set(d.entryId, proposedEntries.has(d.entryId));
  // A proposal made in the range that the recruiter has not answered yet is already a review done in the portal.
  for (const p of proposals) {
    if (p.createdAt >= filters.from && p.createdAt < filters.to) reviewed.set(p.entryId, true);
  }
  return {
    approvals,
    feedback,
    reviews: [...reviewed.values()].map((viaPortal) => ({ viaPortal })),
  };
}
