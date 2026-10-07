// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  candidateProfileContentSchema,
  screeningDraftContentSchema,
  type AgencyActor,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { ScreeningPrefillInput } from '@/server/ai/prompts/screening-prefill';
import { redactStructured } from '@/server/ai/redaction';
import {
  findArtifact,
  findOrCreateArtifact,
  latestDraft,
  readApproved,
} from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';

export interface PrefillPlan {
  artifactId: string;
  input: ScreeningPrefillInput;
  inputRefs: Record<string, unknown>;
}

/**
 * Prepares A11 (FR-SCR-03): needs the confirmed profile. The model gets it without name or contact
 * details. The suggestions are stored as a draft that no later step reads.
 */
export async function planScreeningPrefill(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<PrefillPlan> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const [profile, position] = await Promise.all([
    readApproved(tx, {
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: entry.candidateId },
    }),
    tx.position.findUniqueOrThrow({
      where: { id: entry.positionId },
      select: { title: true, location: true },
    }),
  ]);
  if (!profile)
    throw new ApiError('conflict', "Confirm the candidate's profile first", { status: 409 });
  const parsed = candidateProfileContentSchema.parse(profile.content);
  const redacted = redactStructured({
    currentPosition: parsed.currentPosition,
    careerHistory: parsed.careerHistory,
    education: parsed.education,
    coreSkills: parsed.coreSkills,
    technicalSkills: parsed.technicalSkills,
    industryExperience: parsed.industryExperience,
    leadershipExperience: parsed.leadershipExperience,
    teamSize: parsed.teamSize,
    careerProgression: parsed.careerProgression,
    majorAchievements: parsed.majorAchievements,
    location: parsed.location,
    workAuthorization: parsed.workAuthorization,
    compensationExpectation: parsed.compensationExpectation,
  });
  const artifact = await findOrCreateArtifact(tx, {
    agencyId: actor.agencyId,
    kind: 'screening_draft',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  return {
    artifactId: artifact.id,
    input: { position, profile: redacted.value },
    inputRefs: {
      entryId,
      candidateProfileVersionId: profile.id,
      redactedCategories: redacted.removed,
    },
  };
}

type Runner = (
  purpose: 'screening.prefill',
  input: ScreeningPrefillInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export async function generateScreeningPrefill(
  deps: { run: Runner; withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T> },
  actor: AgencyActor,
  entryId: string,
  options: { onDelta?: (text: string) => void; signal?: AbortSignal } = {},
) {
  const plan = await deps.withAgency((tx) => planScreeningPrefill(tx, actor, entryId));
  const entry = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const result = await deps.run('screening.prefill', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId: entry.positionId,
    subject: { type: 'pipeline_entry', id: entryId },
    artifactId: plan.artifactId,
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { artifactId: plan.artifactId, generationId: result.generationId, draft: result.draft };
}

/** The newest suggestions for the entry, if the recruiter asked for any. */
export async function getScreeningPrefill(tx: ScopedTx, actor: AgencyActor, entryId: string) {
  await requireEntry(tx, actor, entryId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'screening_draft',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  const draft = artifact ? await latestDraft(tx, artifact.id) : null;
  const parsed = draft ? screeningDraftContentSchema.safeParse(draft.content) : null;
  return parsed?.success ? { versionId: draft!.id, items: parsed.data.items } : null;
}
