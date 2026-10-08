// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  FEEDBACK_CRITERIA,
  MATCH_WEIGHT_KEYS,
  type AgencyActor,
  type CriterionLevel,
  type EntryFact,
  type PositionFact,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { versionStatuses } from '@/server/artifacts/service';
import { visibilityFilter } from '@/server/positions/service';

/**
 * The facts behind the history and the pattern reports (brief 14). This is the ONE place that reads
 * records for them, and it reads a fixed, short list of columns: the stages a candidate went
 * through, the outreach answers, the hiring manager's ratings, and four job-related fields of the
 * candidate (level, years, skills, source). It never selects a name, a contact detail, a location, a
 * free-text comment or a reason text, so nothing personal or protected can reach a report or a
 * model from here. A guard test reads this file to keep it that way.
 */
const NEGATIVE_END = new Set([
  'not_interested',
  'no_response',
  'client_rejected',
  'rejected',
  'declined',
  'reneged',
  'withdrawn',
  'closed',
]);
const HIRED = new Set(['accepted', 'started']);
/** Reports read at most this many records, the oldest first, when an agency has more. */
const MAX_ENTRIES = 5000;

const entrySelect = {
  id: true,
  positionId: true,
  state: true,
  candidate: {
    select: { seniority: true, yearsExperience: true, skills: true, source: true },
  },
  transitions: {
    select: { fromState: true, toState: true, reasonCode: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
  touches: { select: { status: true, response: true } },
  submissions: { select: { id: true } },
  interviews: {
    select: {
      status: true,
      feedback: {
        where: { fromRole: 'hm' },
        select: {
          technicalFit: true,
          leadershipFit: true,
          communication: true,
          culturalFit: true,
          industryExperience: true,
        },
      },
    },
  },
} satisfies Prisma.PipelineEntrySelect;

type EntryRow = Prisma.PipelineEntryGetPayload<{ select: typeof entrySelect }>;

function toFact(row: EntryRow, clientId: string, criteria: EntryFact['criteria']): EntryFact {
  const reached = (state: string) => row.transitions.some((t) => t.toState === state);
  const submitted = reached('submitted') || row.submissions.length > 0;
  const interviewed =
    reached('interviewing') || row.interviews.some((i) => i.status !== 'cancelled');
  const lastIntoState = [...row.transitions].reverse().find((t) => t.toState === row.state);
  const feedback: EntryFact['feedback'] = {};
  for (const interview of row.interviews)
    for (const f of interview.feedback)
      for (const criterion of FEEDBACK_CRITERIA) {
        const rating = f[criterion];
        if (!rating) continue;
        const counts = (feedback[criterion] ??= {});
        counts[rating] = (counts[rating] ?? 0) + 1;
      }
  return {
    entryId: row.id,
    positionId: row.positionId,
    clientId,
    seniority: row.candidate.seniority,
    yearsExperience: row.candidate.yearsExperience,
    skills: row.candidate.skills,
    source: row.candidate.source,
    submitted,
    interviewed,
    offered: reached('offer'),
    hired: HIRED.has(row.state),
    contacted: reached('contacting') || row.touches.some((t) => t.status === 'sent'),
    responded:
      reached('interested') ||
      reached('not_interested') ||
      row.touches.some((t) => t.response !== null && t.response !== 'no_response'),
    decision: reached('interviewing') ? 'advanced' : reached('client_rejected') ? 'declined' : null,
    exit: NEGATIVE_END.has(row.state)
      ? {
          stage: lastIntoState?.fromState ?? row.state,
          reasonCode: lastIntoState?.reasonCode ?? null,
        }
      : null,
    feedback,
    criteria,
  };
}

export interface Facts {
  entries: EntryFact[];
  positions: PositionFact[];
}

/**
 * Loads the facts for the positions the actor may see: every client's (agency scope) or one
 * client's. A match analysis counts only once the recruiter has reviewed it (FR-AI-02).
 */
export async function loadFacts(
  tx: ScopedTx,
  actor: AgencyActor,
  scope: { clientId?: string },
): Promise<Facts> {
  const positions = await tx.position.findMany({
    where: {
      AND: [await visibilityFilter(tx, actor), scope.clientId ? { clientId: scope.clientId } : {}],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      title: true,
      clientId: true,
      workArrangement: true,
      compMin: true,
      compMax: true,
    },
  });
  const clientOf = new Map(positions.map((p) => [p.id, p.clientId]));
  const rows = await tx.pipelineEntry.findMany({
    where: { positionId: { in: positions.map((p) => p.id) } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_ENTRIES,
    select: entrySelect,
  });

  const analyses = await tx.matchAnalysis.findMany({
    where: { entryId: { in: rows.map((r) => r.id) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { entryId: true, versionId: true, criterionScores: true },
  });
  const latest = new Map<string, (typeof analyses)[number]>();
  for (const a of analyses) if (!latest.has(a.entryId)) latest.set(a.entryId, a);
  const statuses = await versionStatuses(
    tx,
    [...latest.values()].flatMap((a) => (a.versionId ? [a.versionId] : [])),
  );
  const criteriaOf = (entryId: string): EntryFact['criteria'] => {
    const a = latest.get(entryId);
    if (!a?.versionId || statuses.get(a.versionId) !== 'approved') return null;
    const scores = (a.criterionScores ?? {}) as Record<string, { level?: string }>;
    return Object.fromEntries(
      MATCH_WEIGHT_KEYS.flatMap((k) =>
        scores[k]?.level ? [[k, scores[k].level as CriterionLevel]] : [],
      ),
    );
  };

  return {
    entries: rows.map((r) => toFact(r, clientOf.get(r.positionId)!, criteriaOf(r.id))),
    positions: positions.map((p) => ({
      positionId: p.id,
      title: p.title,
      clientId: p.clientId,
      workArrangement: p.workArrangement,
      statesPay: p.compMin !== null || p.compMax !== null,
    })),
  };
}
