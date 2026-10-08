// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, FeedbackEmailInput } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { FeedbackStructureInput } from '@/server/ai/prompts/feedback-structure';
import { redactText, scrubContactDetails } from '@/server/ai/redaction';
import { findArtifact, findOrCreateArtifact } from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';
import { scrubName } from '@/server/qualification/service';

type Runner = (
  purpose: 'feedback.structure',
  input: FeedbackStructureInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;
interface Deps {
  run: Runner;
  withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;
}
interface StreamOptions {
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

export interface FeedbackDraftOverview {
  artifactId: string;
  approvedVersionId: string | null;
}

async function requireRound(tx: ScopedTx, entryId: string, interviewId: string) {
  const interview = await tx.interview.findFirst({
    where: { id: interviewId, entryId },
    select: { id: true },
  });
  if (!interview) throw notFound('Interview');
}

/** The feedback draft of one round, if the recruiter has pasted an email for it (T-9-03). */
export async function getFeedbackDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  interviewId: string,
): Promise<FeedbackDraftOverview | null> {
  await requireEntry(tx, actor, entryId, 'read');
  await requireRound(tx, entryId, interviewId);
  const artifact = await findArtifact(tx, {
    kind: 'interview_feedback',
    subject: { type: 'interview', id: interviewId },
  });
  return artifact
    ? { artifactId: artifact.id, approvedVersionId: artifact.approvedVersionId }
    : null;
}

export interface FeedbackPlan {
  input: FeedbackStructureInput;
  artifactId: string;
  positionId: string;
  inputRefs: Record<string, unknown>;
}

/**
 * Prepares A17 (T-9-03, US-903): the pasted email goes to the model without the candidate's name
 * and with contact details and protected details removed.
 */
export async function planFeedbackDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  interviewId: string,
  input: FeedbackEmailInput,
): Promise<FeedbackPlan> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  await requireRound(tx, entryId, interviewId);
  const [candidate, position] = await Promise.all([
    tx.candidate.findUniqueOrThrow({
      where: { id: entry.candidateId },
      select: { fullName: true },
    }),
    tx.position.findUniqueOrThrow({ where: { id: entry.positionId }, select: { title: true } }),
  ]);
  const redacted = redactText(scrubContactDetails(scrubName(input.email, candidate.fullName)));
  const artifact = await findOrCreateArtifact(tx, {
    agencyId: actor.agencyId,
    kind: 'interview_feedback',
    subject: { type: 'interview', id: interviewId },
  });
  return {
    artifactId: artifact.id,
    positionId: entry.positionId,
    input: { email: redacted.value, fromRole: input.fromRole, position },
    inputRefs: { entryId, interviewId, redactedCategories: redacted.removed },
  };
}

export async function generateFeedbackDraft(
  deps: Deps,
  actor: AgencyActor,
  entryId: string,
  interviewId: string,
  input: FeedbackEmailInput,
  options: StreamOptions = {},
) {
  const plan = await deps.withAgency((tx) =>
    planFeedbackDraft(tx, actor, entryId, interviewId, input),
  );
  const result = await deps.run('feedback.structure', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId: plan.positionId,
    subject: { type: 'interview', id: interviewId },
    artifactId: plan.artifactId,
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { artifactId: plan.artifactId, generationId: result.generationId, draft: result.draft };
}
