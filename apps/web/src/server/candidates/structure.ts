// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import type { AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { ProfileStructureInput } from '@/server/ai/prompts/profile-structure';
import { redactText } from '@/server/ai/redaction';
import type { JobContext } from '@/worker/registry';

/** Longest source text sent to the model; a resume longer than this is cut and the recruiter is told. */
export const MAX_SOURCE_CHARS = 60_000;

export interface StructurePlan {
  input: ProfileStructureInput;
  inputRefs: {
    candidateId: string;
    documentIds: string[];
    redactedCategories: string[];
    truncated: boolean;
  };
}

/**
 * Prepares A7 for a candidate (US-202): joins the text of the documents that were read, strips
 * protected characteristics (FR-AI-09; the stored originals are untouched), and records which
 * documents and which removals the draft came from.
 */
export async function planProfileStructure(
  tx: ScopedTx,
  candidateId: string,
): Promise<StructurePlan> {
  const candidate = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, source: true, status: true },
  });
  if (!candidate || candidate.status === 'discarded') throw notFound('Candidate');
  const documents = await tx.candidateDocument.findMany({
    where: { candidateId, extractionStatus: 'ready', extractedText: { not: null } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, extractedText: true },
  });
  if (documents.length === 0) {
    throw new ApiError('unreadable_document', 'There is no readable resume or profile yet', {
      status: 422,
    });
  }
  const joined = documents.map((d) => d.extractedText!).join('\n\n---\n\n');
  const redacted = redactText(joined);
  const truncated = redacted.value.length > MAX_SOURCE_CHARS;
  return {
    input: { sourceText: redacted.value.slice(0, MAX_SOURCE_CHARS), source: candidate.source },
    inputRefs: {
      candidateId,
      documentIds: documents.map((d) => d.id),
      redactedCategories: redacted.removed,
      truncated,
    },
  };
}

export type StructureRunner = (
  purpose: 'profile.structure',
  input: ProfileStructureInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export function runProfileStructure(
  run: StructureRunner,
  actor: AgencyActor,
  plan: StructurePlan,
  options: { signal?: AbortSignal } = {},
): Promise<AiRunResult> {
  return run('profile.structure', plan.input, {
    agencyId: actor.agencyId,
    actor,
    subject: { type: 'candidate', id: plan.inputRefs.candidateId },
    inputRefs: plan.inputRefs,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

const dataSchema = z.object({ candidateId: z.guid() });

/**
 * Worker job `ai:profile.structure` (T-2-03): runs A7 for the person who asked (the upload or the
 * "structure again" button). A refusal that retrying cannot fix (budget used, no assistant, bad
 * input) is final; anything else is retried by the queue.
 */
export async function structureCandidateJob(ctx: JobContext, run: StructureRunner): Promise<void> {
  const { candidateId } = dataSchema.parse(ctx.data);
  if (!ctx.agencyId || !ctx.requestedById)
    throw new UnrecoverableError('A recruiter must ask for this');
  const agencyId = ctx.agencyId;
  const userId = ctx.requestedById;

  const { plan, role } = await ctx.withAgency(async (tx) => {
    const member = await tx.membership.findFirst({
      where: { userId, active: true },
      select: { role: true },
    });
    if (!member) throw new UnrecoverableError('The person who asked is no longer a member');
    return { plan: await planProfileStructure(tx, candidateId), role: member.role };
  });
  try {
    const result = await runProfileStructure(run, { kind: 'agency', userId, agencyId, role }, plan);
    await ctx.progress({
      status: 'ready',
      candidateId,
      artifactId: result.draft?.artifactId ?? null,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      await ctx.progress({ status: 'failed', candidateId, reason: error.code });
      throw new UnrecoverableError(error.message);
    }
    throw error;
  }
}
