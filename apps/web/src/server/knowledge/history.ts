// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  FEEDBACK_CRITERIA,
  isSmallSample,
  mentionsProtected,
  type AgencyActor,
  type EntryFact,
  type FeedbackCriterion,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import { requirePosition } from '@/server/positions/service';
import { loadFacts } from './facts';

/**
 * The client's history (T-12-01, FR-KNW-01, brief 14): what the agency put forward for this client
 * before, what the hiring managers did with it, and what they said. It reads the recruiter's own
 * records; nothing in it is inferred. Every count says how many records it comes from, and the
 * records can be opened from it.
 */
export type CandidateOutcome =
  | 'hired'
  | 'offer'
  | 'interviewing'
  | 'declined_after_submission'
  | 'rejected_after_interview'
  | 'withdrawn'
  | 'submitted'
  | 'other';

export interface HistoryCandidate {
  entryId: string;
  positionId: string;
  positionTitle: string;
  candidateName: string;
  state: string;
  outcome: CandidateOutcome;
  seniority: string | null;
  submittedAt: Date | null;
  rounds: { roundName: string; status: string; scheduledAt: Date | null }[];
  /** The hiring manager's ratings of this candidate, counted. */
  ratings: Partial<
    Record<FeedbackCriterion, Partial<Record<'strong' | 'moderate' | 'gap', number>>>
  >;
  /** The agency's reason code when the hiring manager turned the candidate down. */
  reasonCode: string | null;
}

export interface HistoryPosition {
  id: string;
  title: string;
  status: string;
  openings: number;
  createdAt: Date;
  isCurrent: boolean;
  submitted: number;
  interviewed: number;
  hired: number;
}

export interface ClientHistory {
  client: { id: string; name: string };
  currentPositionId: string;
  asOf: string;
  totals: { positions: number; submitted: number; interviewed: number; hired: number };
  positions: HistoryPosition[];
  /** Every candidate put forward to this client from the positions the viewer can see, newest first. */
  candidates: HistoryCandidate[];
  /** The hiring managers' ratings by criterion over all their feedback, with the number of ratings. */
  feedback: {
    criterion: FeedbackCriterion;
    strong: number;
    moderate: number;
    gap: number;
    total: number;
    small: boolean;
  }[];
  /** Why the hiring managers turned candidates down, by the agency's reason codes. */
  declineReasons: { code: string; count: number; small: boolean }[];
  /** Reason codes left out because they name a protected characteristic (brief 14, NFR-AI04). */
  withheldReasons: number;
}

function outcomeOf(fact: EntryFact, state: string): CandidateOutcome {
  if (fact.hired) return 'hired';
  if (state === 'offer') return 'offer';
  if (state === 'interviewing' || state === 'on_hold') return 'interviewing';
  if (state === 'client_rejected') return 'declined_after_submission';
  if (state === 'rejected') return 'rejected_after_interview';
  if (state === 'withdrawn') return 'withdrawn';
  if (state === 'submitted') return 'submitted';
  return 'other';
}

/** Reads the client history for the client of a position the viewer can see. */
export async function getClientHistory(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<ClientHistory> {
  const current = await requirePosition(tx, actor, positionId, 'read');
  const client = await tx.client.findUnique({
    where: { id: current.clientId },
    select: { id: true, name: true },
  });
  if (!client) throw notFound('Client');
  const facts = await loadFacts(tx, actor, { clientId: client.id });
  const submitted = facts.entries.filter((e) => e.submitted);

  const positions = await tx.position.findMany({
    where: { id: { in: facts.positions.map((p) => p.positionId) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, title: true, status: true, openings: true, createdAt: true },
  });
  const titleOf = new Map(positions.map((p) => [p.id, p.title]));

  const rows = await tx.pipelineEntry.findMany({
    where: { id: { in: submitted.map((e) => e.entryId) } },
    select: {
      id: true,
      state: true,
      candidate: { select: { fullName: true } },
      submissions: { select: { submittedAt: true }, orderBy: { submittedAt: 'asc' }, take: 1 },
      interviews: {
        select: { roundName: true, status: true, scheduledAt: true },
        orderBy: [{ scheduledAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      },
    },
  });
  const rowOf = new Map(rows.map((r) => [r.id, r]));

  let withheldReasons = 0;
  const safeReason = (code: string | null): string | null => {
    if (code === null) return null;
    if (!mentionsProtected(code)) return code;
    withheldReasons += 1;
    return null;
  };

  const candidates: HistoryCandidate[] = submitted
    .flatMap((fact) => {
      const row = rowOf.get(fact.entryId);
      if (!row) return [];
      return [
        {
          entryId: fact.entryId,
          positionId: fact.positionId,
          positionTitle: titleOf.get(fact.positionId) ?? '',
          candidateName: row.candidate.fullName,
          state: row.state,
          outcome: outcomeOf(fact, row.state),
          seniority: fact.seniority,
          submittedAt: row.submissions[0]?.submittedAt ?? null,
          rounds: row.interviews,
          ratings: fact.feedback,
          reasonCode:
            fact.decision === 'declined' ? safeReason(fact.exit?.reasonCode ?? null) : null,
        },
      ];
    })
    .sort(
      (a, b) =>
        (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0) ||
        a.entryId.localeCompare(b.entryId),
    );

  const feedback = FEEDBACK_CRITERIA.map((criterion) => {
    let strong = 0;
    let moderate = 0;
    let gap = 0;
    for (const e of facts.entries) {
      const c = e.feedback[criterion];
      strong += c?.strong ?? 0;
      moderate += c?.moderate ?? 0;
      gap += c?.gap ?? 0;
    }
    const total = strong + moderate + gap;
    return { criterion, strong, moderate, gap, total, small: isSmallSample(total) };
  });

  const reasons = new Map<string, number>();
  for (const c of candidates)
    if (c.reasonCode) reasons.set(c.reasonCode, (reasons.get(c.reasonCode) ?? 0) + 1);

  return {
    client,
    currentPositionId: positionId,
    asOf: new Date().toISOString().slice(0, 10),
    totals: {
      positions: positions.length,
      submitted: submitted.length,
      interviewed: submitted.filter((e) => e.interviewed).length,
      hired: submitted.filter((e) => e.hired).length,
    },
    positions: positions.map((p) => {
      const of = submitted.filter((e) => e.positionId === p.id);
      return {
        ...p,
        isCurrent: p.id === positionId,
        submitted: of.length,
        interviewed: of.filter((e) => e.interviewed).length,
        hired: of.filter((e) => e.hired).length,
      };
    }),
    candidates,
    feedback,
    declineReasons: [...reasons]
      .map(([code, count]) => ({ code, count, small: isSmallSample(count) }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    withheldReasons,
  };
}
