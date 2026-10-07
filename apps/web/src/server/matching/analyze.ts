// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  DEFAULT_MATCH_WEIGHTS,
  candidateProfileContentSchema,
  criterionScoresOf,
  summarizeAnalysis,
  matchingWeightsSchema,
  successProfileContentSchema,
  type AgencyActor,
  type MatchAnalysisContent,
} from '@easemuse/core';
import type { Prisma } from '@prisma/client';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import { matchAnalyzePrompt, type MatchAnalyzeInput } from '@/server/ai/prompts/match-analyze';
import { assertNoProtectedFields, redactStructured } from '@/server/ai/redaction';
import { logActivity } from '@/server/activity/service';
import { readApproved } from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';
import { overallFor } from './scoring';

export interface MatchPlan {
  entryId: string;
  input: MatchAnalyzeInput;
  weights: Record<string, number>;
  inputRefs: {
    entryId: string;
    candidateProfileVersionId: string;
    successProfileVersionId: string;
    redactedCategories: string[];
  };
}

/**
 * Prepares A10 for one pipeline entry (US-302). Only APPROVED content is compared: the confirmed
 * profile of the candidate and the confirmed success profile of the position. The model never sees
 * the candidate's name or contact details, the AI's own "potential motivation / concerns" guesses,
 * or any protected characteristic (FR-AI-09, NFR-AI04).
 */
export async function planMatchAnalysis(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<MatchPlan> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const [candidateProfile, successProfile, position] = await Promise.all([
    readApproved(tx, {
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: entry.candidateId },
    }),
    readApproved(tx, {
      kind: 'success_profile',
      subject: { type: 'position', id: entry.positionId },
    }),
    tx.position.findUniqueOrThrow({
      where: { id: entry.positionId },
      select: {
        title: true,
        location: true,
        workArrangement: true,
        compMin: true,
        compMax: true,
        compCurrency: true,
        matchingWeights: true,
      },
    }),
  ]);
  if (!candidateProfile) {
    throw new ApiError('conflict', "Confirm the candidate's profile first", { status: 409 });
  }
  if (!successProfile) {
    throw new ApiError('conflict', "Confirm the position's success profile first", { status: 409 });
  }

  const parsed = candidateProfileContentSchema.parse(candidateProfile.content);
  const {
    fullName: _name,
    email: _email,
    phone: _phone,
    potentialMotivation: _m,
    potentialConcerns: _c,
    ...rest
  } = parsed;
  void [_name, _email, _phone, _m, _c];
  const redacted = redactStructured(rest);
  assertNoProtectedFields(redacted.value, 'match analysis input');

  const weights = matchingWeightsSchema.safeParse(position.matchingWeights);
  const pay =
    position.compMin !== null || position.compMax !== null
      ? `${position.compMin ?? ''}-${position.compMax ?? ''} ${position.compCurrency}`
      : null;
  return {
    entryId,
    weights: weights.success ? weights.data : DEFAULT_MATCH_WEIGHTS,
    input: {
      successProfile: successProfileContentSchema.parse(successProfile.content),
      candidate: redacted.value,
      position: {
        title: position.title,
        location: position.location,
        workArrangement: position.workArrangement,
        compensation: pay,
      },
    },
    inputRefs: {
      entryId,
      candidateProfileVersionId: candidateProfile.id,
      successProfileVersionId: successProfile.id,
      redactedCategories: redacted.removed,
    },
  };
}

export type MatchRunner = (
  purpose: 'match.analyze',
  input: MatchAnalyzeInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export interface MatchAnalysisRow {
  id: string;
  entryId: string;
  artifactId: string;
  versionId: string;
  overallScore: number;
}

/**
 * Stores the analysis read model for a finished run: the criterion scores from the draft, the
 * weights used, and the overall score computed in code (ADR-007). The recruiter has not reviewed it
 * yet, so nothing depends on it until they mark it reviewed (T-3-11).
 */
export async function recordAnalysis(
  tx: ScopedTx,
  actor: AgencyActor,
  plan: MatchPlan,
  draft: { artifactId: string; versionId: string },
  content: MatchAnalysisContent,
): Promise<MatchAnalysisRow> {
  const criterionScores = criterionScoresOf(content.criteria);
  const overallScore = overallFor(plan.weights, criterionScores, []);
  const row = await tx.matchAnalysis.create({
    data: {
      agencyId: actor.agencyId,
      entryId: plan.entryId,
      artifactId: draft.artifactId,
      versionId: draft.versionId,
      profileVersionId: plan.inputRefs.candidateProfileVersionId,
      successProfileVersionId: plan.inputRefs.successProfileVersionId,
      weights: plan.weights,
      criterionScores: criterionScores as unknown as Prisma.InputJsonValue,
      summary: summarizeAnalysis(
        content,
        new Map(plan.input.successProfile.criteria.map((c) => [c.id, c.category])),
      ) as unknown as Prisma.InputJsonValue,
      overallScore,
    },
    select: { id: true },
  });
  const entry = await tx.pipelineEntry.findUniqueOrThrow({
    where: { id: plan.entryId },
    select: { candidateId: true, positionId: true },
  });
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'match.analyzed',
      entityType: type,
      entityId: id,
      data: { entryId: plan.entryId, analysisId: row.id, overallScore },
    });
  }
  return {
    id: row.id,
    entryId: plan.entryId,
    artifactId: draft.artifactId,
    versionId: draft.versionId,
    overallScore,
  };
}

/**
 * Runs A10 for one entry and records the result. The model call happens outside any transaction;
 * the read model is written afterwards in its own, so a failed call leaves nothing behind.
 */
export async function analyzeEntry(
  deps: { run: MatchRunner; withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T> },
  actor: AgencyActor,
  entryId: string,
  options: { onDelta?: (text: string) => void; signal?: AbortSignal } = {},
): Promise<MatchAnalysisRow & { generationId: string }> {
  const plan = await deps.withAgency((tx) => planMatchAnalysis(tx, actor, entryId));
  const entry = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const result = await deps.run('match.analyze', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId: entry.positionId,
    subject: { type: 'pipeline_entry', id: entryId },
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!result.draft)
    throw new ApiError('internal_error', 'The analysis was not saved', { status: 500 });
  const content = matchAnalyzePrompt.toContent!(
    matchAnalyzePrompt.schema.parse(result.output),
    plan.input,
  ) as unknown as MatchAnalysisContent;
  const row = await deps.withAgency((tx) =>
    recordAnalysis(tx, actor, plan, result.draft!, content),
  );
  return { ...row, generationId: result.generationId };
}
