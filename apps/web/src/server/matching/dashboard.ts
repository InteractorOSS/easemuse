// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  MATCH_WEIGHT_KEYS,
  type AgencyActor,
  type CriterionOverride,
  type CriterionScores,
  type MatchLevel,
  type MatchSummary,
  type MatchWeightKey,
  type PipelineState,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { versionStatuses } from '@/server/artifacts/service';
import { requirePosition } from '@/server/positions/service';
import { getAgencySettings } from '@/server/tenancy/settings';
import { parseOverrides } from './scoring';

export type CriteriaView = Record<
  MatchWeightKey,
  { level: MatchLevel; score: number | null; overridden: boolean }
>;

/** One row of the candidate review dashboard (brief 5.3, US-304). */
export interface DashboardRow {
  entryId: string;
  candidateId: string;
  candidateName: string;
  state: PipelineState;
  doNotContact: boolean;
  /** Where the recruiter placed this candidate; wins over the suggested order. */
  manualRank: number | null;
  analysis: null | {
    id: string;
    /** Shown score: the recruiter's override if there is one, else the computed one. Null in explain-only mode. */
    overall: number | null;
    computedOverall: number | null;
    overridden: boolean;
    /** Per criterion: level always, number unless explain-only. `overridden` marks a recruiter's change. */
    criteria: Record<
      MatchWeightKey,
      { level: MatchLevel; score: number | null; overridden: boolean }
    >;
    summary: MatchSummary | null;
    assessmentPreview: string | null;
    hasAssessment: boolean;
    stale: boolean;
    /** The recruiter marked this analysis reviewed (approved): only then do later steps use it. */
    reviewed: boolean;
    analyzedAt: Date;
  };
}

export interface Dashboard {
  /** True when the agency hides numeric scores (explain-only mode). */
  explainOnly: boolean;
  rows: DashboardRow[];
}

const PREVIEW = 160;

/**
 * The dashboard of a position: everyone in the pipeline with the newest analysis, in the suggested
 * review order (brief 5.3). The order is: the recruiter's manual order first, then the shown score
 * from highest, then those not analyzed yet, then by name. Nobody is hidden or excluded by a score
 * (brief 1.1); `explainOnly` removes the numbers but keeps the order and the levels.
 */
export async function getDashboard(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<Dashboard> {
  await requirePosition(tx, actor, positionId, 'read');
  const [{ explainOnly }, entries] = await Promise.all([
    getAgencySettings(tx, actor.agencyId),
    tx.pipelineEntry.findMany({
      where: { positionId },
      select: {
        id: true,
        state: true,
        manualRank: true,
        candidate: { select: { id: true, fullName: true, doNotContact: true } },
      },
    }),
  ]);
  const analyses = entries.length
    ? await tx.matchAnalysis.findMany({
        where: { entryId: { in: entries.map((e) => e.id) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    : [];
  const newest = new Map<string, (typeof analyses)[number]>();
  for (const a of analyses) if (!newest.has(a.entryId)) newest.set(a.entryId, a);
  const statuses = await versionStatuses(
    tx,
    [...newest.values()].flatMap((a) => (a.versionId ? [a.versionId] : [])),
  );

  const rows = entries.map((e): DashboardRow & { sortScore: number | null } => {
    const a = newest.get(e.id);
    const base = {
      entryId: e.id,
      candidateId: e.candidate.id,
      candidateName: e.candidate.fullName,
      state: e.state as PipelineState,
      doNotContact: e.candidate.doNotContact,
      manualRank: e.manualRank,
    };
    if (!a) return { ...base, analysis: null, sortScore: null };
    const scores = a.criterionScores as unknown as CriterionScores;
    const overrides = parseOverrides(a.criterionOverrides) as CriterionOverride[];
    const shown = a.overrideScore ?? a.overallScore;
    const hide = (n: number) => (explainOnly ? null : n);
    const text = a.recruiterAssessment?.trim() ?? '';
    return {
      ...base,
      sortScore: shown,
      analysis: {
        id: a.id,
        overall: hide(shown),
        computedOverall: hide(a.overallScore),
        overridden: a.overrideScore !== null,
        criteria: Object.fromEntries(
          MATCH_WEIGHT_KEYS.map((key) => {
            const o = overrides.find((x) => x.key === key);
            return [
              key,
              {
                level: scores[key].level,
                score: hide(o ? o.score : scores[key].score),
                overridden: Boolean(o),
              },
            ];
          }),
        ) as DashboardRow['analysis'] extends infer T
          ? T extends { criteria: infer C }
            ? C
            : never
          : never,
        summary:
          a.summary && Object.keys(a.summary as object).length
            ? (a.summary as unknown as MatchSummary)
            : null,
        assessmentPreview: text
          ? text.length > PREVIEW
            ? `${text.slice(0, PREVIEW)}…`
            : text
          : null,
        hasAssessment: text !== '',
        stale: a.stale,
        reviewed: a.versionId ? statuses.get(a.versionId) === 'approved' : false,
        analyzedAt: a.createdAt,
      },
    };
  });

  rows.sort((x, y) => {
    const mx = x.manualRank,
      my = y.manualRank;
    if (mx !== null && my !== null && mx !== my) return mx - my;
    if (mx !== null && my === null) return -1;
    if (mx === null && my !== null) return 1;
    if (x.sortScore !== null && y.sortScore !== null && x.sortScore !== y.sortScore)
      return y.sortScore - x.sortScore;
    if (x.sortScore !== null && y.sortScore === null) return -1;
    if (x.sortScore === null && y.sortScore !== null) return 1;
    return x.candidateName.localeCompare(y.candidateName) || x.entryId.localeCompare(y.entryId);
  });
  return { explainOnly, rows: rows.map(({ sortScore, ...row }) => (void sortScore, row)) };
}

/**
 * Saves the recruiter's order for a position (US-304): the listed candidates get ranks 1..n in the
 * order given and everyone else goes back to the suggested order. Owner, lead or admin of the position.
 */
export async function setManualOrder(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  entryIds: string[],
): Promise<void> {
  await requirePosition(tx, actor, positionId, 'edit');
  const inPosition = await tx.pipelineEntry.findMany({
    where: { positionId },
    select: { id: true },
  });
  const known = new Set(inPosition.map((e) => e.id));
  if (new Set(entryIds).size !== entryIds.length || entryIds.some((id) => !known.has(id))) {
    throw new ApiError(
      'invalid_input',
      'The order contains a candidate that is not in this position',
      { status: 422, fields: { entryIds: 'Unknown candidate' } },
    );
  }
  await tx.pipelineEntry.updateMany({ where: { positionId }, data: { manualRank: null } });
  for (const [index, id] of entryIds.entries()) {
    await tx.pipelineEntry.update({
      where: { id },
      data: { manualRank: index + 1 } as Prisma.PipelineEntryUncheckedUpdateInput,
    });
  }
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.review_order_set',
    entityType: 'position',
    entityId: positionId,
    data: { count: entryIds.length },
  });
}
