// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  matchAnalysisContentSchema,
  successProfileContentSchema,
  strengthsAndGaps,
  type AgencyActor,
  type CriterionResult,
  type MatchAnalysisContent,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { approveVersion, getVersionForReview, readApproved } from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';
import { getAgencySettings } from '@/server/tenancy/settings';
import { parseOverrides } from './scoring';

/** Everything the analysis page shows (US-302, T-3-09): scores with their grounds, gaps, and what to confirm. */
export interface AnalysisDetail {
  analysis: {
    id: string;
    entryId: string;
    artifactId: string;
    versionId: string | null;
    weights: unknown;
    /** Shown score: the recruiter's override if there is one, else the computed one. Null in explain-only mode. */
    overall: number | null;
    computedOverall: number | null;
    overridden: boolean;
    overrideReason: string | null;
    recruiterAssessment: string | null;
    stale: boolean;
    createdAt: Date;
  };
  explainOnly: boolean;
  criteria: (Omit<CriterionResult, 'score'> & {
    /** The score in use (an override counts). Null in explain-only mode. */
    score: number | null;
    computedScore: number | null;
    overridden: boolean;
    overrideReason: string | null;
  })[];
  requirements: {
    criterionId: string;
    text: string;
    category: 'must_have' | 'disqualifying';
    status: 'met' | 'not_met' | 'unknown';
    evidence: CriterionResult['evidence'];
  }[];
  strengths: { key: string; summary: string }[];
  gaps: { key: string; summary: string; level: 'partial' | 'gap' }[];
  toConfirm: { key: string; text: string }[];
  /** Whether the recruiter marked this analysis reviewed. */
  reviewed: boolean;
  /** Which approved versions of the profiles this analysis compared (the content may have changed since: see `analysis.stale`). */
  basis: { candidateProfileVersionId: string; successProfileVersionId: string };
}

export async function getAnalysisDetail(
  tx: ScopedTx,
  actor: AgencyActor,
  analysisId: string,
): Promise<AnalysisDetail> {
  const row = await tx.matchAnalysis.findUnique({ where: { id: analysisId } });
  if (!row) throw notFound('Analysis');
  await requireEntry(tx, actor, row.entryId, 'read');
  const [{ explainOnly }, version, successVersion] = await Promise.all([
    getAgencySettings(tx, actor.agencyId),
    row.versionId ? getVersionForReview(tx, row.versionId) : null,
    getVersionForReview(tx, row.successProfileVersionId),
  ]);
  if (!version) throw notFound('Analysis');
  const content: MatchAnalysisContent = matchAnalysisContentSchema.parse(version.content);
  const success = successVersion
    ? successProfileContentSchema.safeParse(successVersion.content)
    : null;
  const named = new Map((success?.success ? success.data.criteria : []).map((c) => [c.id, c]));
  const overrides = parseOverrides(row.criterionOverrides);
  const hide = (n: number | null) => (explainOnly ? null : n);
  const { strengths, gaps, toConfirm } = strengthsAndGaps(content.criteria);

  return {
    analysis: {
      id: row.id,
      entryId: row.entryId,
      artifactId: row.artifactId,
      versionId: row.versionId,
      weights: row.weights,
      overall: hide(row.overrideScore ?? row.overallScore),
      computedOverall: hide(row.overallScore),
      overridden: row.overrideScore !== null,
      overrideReason: row.overrideReason,
      recruiterAssessment: row.recruiterAssessment,
      stale: row.stale,
      createdAt: row.createdAt,
    },
    explainOnly,
    criteria: content.criteria.map((c) => {
      const o = overrides.find((x) => x.key === c.key);
      return {
        ...c,
        score: hide(o ? o.score : c.score),
        computedScore: hide(c.score),
        overridden: Boolean(o),
        overrideReason: o?.reason ?? null,
      };
    }),
    requirements: content.requirements.flatMap((r) => {
      const c = named.get(r.criterionId);
      return c && (c.category === 'must_have' || c.category === 'disqualifying')
        ? [
            {
              criterionId: r.criterionId,
              text: c.text,
              category: c.category,
              status: r.status,
              evidence: r.evidence,
            },
          ]
        : [];
    }),
    strengths: strengths.map((c) => ({ key: c.key, summary: c.summary })),
    gaps: gaps.map((c) => ({
      key: c.key,
      summary: c.summary,
      level: c.level as 'partial' | 'gap',
    })),
    toConfirm,
    reviewed: version.status === 'approved',
    basis: {
      candidateProfileVersionId: row.profileVersionId,
      successProfileVersionId: row.successProfileVersionId,
    },
  };
}

/**
 * "Mark reviewed" (T-3-11, FR-AI-02): the recruiter has read the analysis, so it is approved like
 * any AI draft. Only then may later steps (call questions, the submission report) use it; a draft
 * analysis never feeds them. Allowed for the entry's owner, a lead or an admin.
 */
export async function markReviewed(
  tx: ScopedTx,
  actor: AgencyActor,
  analysisId: string,
): Promise<{ reviewed: true }> {
  const row = await tx.matchAnalysis.findUnique({
    where: { id: analysisId },
    select: { entryId: true, versionId: true },
  });
  if (!row?.versionId) throw notFound('Analysis');
  const entry = await requireEntry(tx, actor, row.entryId, 'edit');
  const version = await getVersionForReview(tx, row.versionId);
  if (!version) throw notFound('Analysis');
  if (version.status === 'approved') return { reviewed: true };
  if (version.status !== 'draft') {
    throw new ApiError('conflict', 'This analysis has been replaced by a newer one', {
      status: 409,
    });
  }
  await approveVersion(tx, actor, row.versionId);
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'match.reviewed',
      entityType: type,
      entityId: id,
      data: { entryId: entry.id, analysisId },
    });
  }
  return { reviewed: true };
}

/**
 * The analysis later steps may use for a candidate: the one the recruiter reviewed, or null. A newer
 * unreviewed run does not replace it until it is reviewed too.
 */
export async function getReviewedAnalysis(tx: ScopedTx, entryId: string) {
  const approved = await readApproved(tx, {
    kind: 'match_analysis',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  if (!approved) return null;
  const row = await tx.matchAnalysis.findFirst({ where: { entryId, versionId: approved.id } });
  return row
    ? { analysis: row, content: matchAnalysisContentSchema.parse(approved.content) }
    : null;
}
