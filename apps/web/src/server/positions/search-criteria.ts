// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { successProfileContentSchema, type AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { SearchCriteriaInput } from '@/server/ai/prompts/search-criteria';
import { findArtifact, readApproved } from '@/server/artifacts/service';
import { requirePosition } from './service';

export interface SearchCriteriaPlan {
  input: SearchCriteriaInput;
  inputRefs: { successProfileVersionId: string; positionId: string };
}

/** Prepares A6 (US-201): the sheet is built from the CONFIRMED success profile only. 409 without one. */
export async function planSearchCriteria(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<SearchCriteriaPlan> {
  await requirePosition(tx, actor, positionId, 'edit');
  const [position, approved] = await Promise.all([
    tx.position.findUniqueOrThrow({
      where: { id: positionId },
      select: { title: true, location: true },
    }),
    readApproved(tx, { kind: 'success_profile', subject: { type: 'position', id: positionId } }),
  ]);
  if (!approved) {
    throw new ApiError(
      'conflict',
      'Confirm the success profile first: the search sheet is built from the confirmed version',
      { status: 409 },
    );
  }
  return {
    input: { profile: successProfileContentSchema.parse(approved.content), position },
    inputRefs: { successProfileVersionId: approved.id, positionId },
  };
}

export type SearchCriteriaRunner = (
  purpose: 'search_criteria.create',
  input: SearchCriteriaInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export function runSearchCriteria(
  run: SearchCriteriaRunner,
  actor: AgencyActor,
  positionId: string,
  plan: SearchCriteriaPlan,
  stream: { onDelta: (text: string) => void; signal: AbortSignal },
): Promise<AiRunResult> {
  return run('search_criteria.create', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId,
    subject: { type: 'position', id: positionId },
    inputRefs: plan.inputRefs,
    onDelta: stream.onDelta,
    signal: stream.signal,
  });
}

export async function getSearchCriteriaArtifact(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
) {
  await requirePosition(tx, actor, positionId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'search_criteria',
    subject: { type: 'position', id: positionId },
  });
  return {
    artifactId: artifact?.id ?? null,
    approvedVersionId: artifact?.approvedVersionId ?? null,
  };
}
