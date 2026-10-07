// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { structuredJdContentSchema, type AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { IntakeQuestionsInput } from '@/server/ai/prompts/intake-questions';
import { findArtifact, readApproved } from '@/server/artifacts/service';
import { requirePosition } from './service';

export interface IntakeQuestionsPlan {
  input: IntakeQuestionsInput;
  inputRefs: { structuredJdVersionId: string; positionId: string };
}

/**
 * Prepares A2 for a position (US-104). The questions are written from the APPROVED structured JD
 * only: unapproved AI output never feeds a later step. Without one the answer is 409.
 */
export async function planIntakeQuestions(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<IntakeQuestionsPlan> {
  await requirePosition(tx, actor, positionId, 'edit');
  const [position, approved] = await Promise.all([
    tx.position.findUniqueOrThrow({
      where: { id: positionId },
      select: { title: true, location: true },
    }),
    readApproved(tx, { kind: 'structured_jd', subject: { type: 'position', id: positionId } }),
  ]);
  if (!approved) {
    throw new ApiError(
      'conflict',
      'Approve the structured JD first: the questions are written from the approved version',
      { status: 409 },
    );
  }
  return {
    input: { structuredJd: structuredJdContentSchema.parse(approved.content), position },
    inputRefs: { structuredJdVersionId: approved.id, positionId },
  };
}

export type IntakeQuestionsRunner = (
  purpose: 'intake.questions',
  input: IntakeQuestionsInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export function runIntakeQuestions(
  run: IntakeQuestionsRunner,
  actor: AgencyActor,
  positionId: string,
  plan: IntakeQuestionsPlan,
  stream: { onDelta: (text: string) => void; signal: AbortSignal },
): Promise<AiRunResult> {
  return run('intake.questions', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId,
    subject: { type: 'position', id: positionId },
    inputRefs: plan.inputRefs,
    onDelta: stream.onDelta,
    signal: stream.signal,
  });
}

/** Where the position's intake question list lives, if one has been drafted. */
export async function getIntakeQuestionsArtifact(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
) {
  await requirePosition(tx, actor, positionId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'intake_questions',
    subject: { type: 'position', id: positionId },
  });
  return {
    artifactId: artifact?.id ?? null,
    approvedVersionId: artifact?.approvedVersionId ?? null,
  };
}
