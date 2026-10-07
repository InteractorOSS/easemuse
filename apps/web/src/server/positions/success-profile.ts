// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  INTAKE_TOPICS,
  intakeAnswersSchema,
  structuredJdContentSchema,
  type AgencyActor,
  type GuardOverride,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { SuccessProfileInput } from '@/server/ai/prompts/success-profile';
import { findArtifact, readApproved } from '@/server/artifacts/service';
import { applyGuards } from '@/server/guards';
import { getAgencySettings } from '@/server/tenancy/settings';
import { isJdApproved } from './jd-approval';
import { requirePosition } from './service';

export interface SuccessProfilePlan {
  input: SuccessProfileInput;
  inputRefs: { structuredJdVersionId: string; positionId: string; intakeTopics: string[] };
  overridden: GuardOverride[];
}

/**
 * Prepares A5 for a position (US-107): needs the approved structured JD and the hiring manager's
 * approval of it (guard `jdApproval`, block or warn per agency), and at least one intake answer.
 * Only approved JD content and accepted intake answers are used.
 */
export async function planSuccessProfile(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  overrides: GuardOverride[] = [],
): Promise<SuccessProfilePlan> {
  await requirePosition(tx, actor, positionId, 'edit');
  const [position, approved, record, settings] = await Promise.all([
    tx.position.findUniqueOrThrow({
      where: { id: positionId },
      select: { title: true, location: true },
    }),
    readApproved(tx, { kind: 'structured_jd', subject: { type: 'position', id: positionId } }),
    tx.intakeRecord.findUnique({ where: { positionId }, select: { answers: true } }),
    getAgencySettings(tx, actor.agencyId),
  ]);
  if (!approved) {
    throw new ApiError('conflict', 'Approve the structured JD first', { status: 409 });
  }
  const overridden = (await isJdApproved(tx, positionId))
    ? []
    : applyGuards(
        [
          {
            guard: 'jdApproval',
            message: 'The hiring manager has not approved the job description.',
          },
        ],
        settings.guardModes,
        overrides,
      );
  const all = intakeAnswersSchema.parse(record?.answers ?? {});
  // Proposed answers (from the hiring manager portal) are not used until the recruiter accepts them.
  const intake = Object.fromEntries(
    INTAKE_TOPICS.flatMap((t) =>
      all[t]?.status === 'accepted' && all[t].value ? [[t, all[t]]] : [],
    ),
  );
  const topics = Object.keys(intake);
  if (topics.length === 0) {
    throw new ApiError('conflict', 'Fill in the hiring manager intake first', { status: 409 });
  }
  return {
    input: { structuredJd: structuredJdContentSchema.parse(approved.content), intake, position },
    inputRefs: { structuredJdVersionId: approved.id, positionId, intakeTopics: topics },
    overridden,
  };
}

export type SuccessProfileRunner = (
  purpose: 'success_profile.create',
  input: SuccessProfileInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export function runSuccessProfile(
  run: SuccessProfileRunner,
  actor: AgencyActor,
  positionId: string,
  plan: SuccessProfilePlan,
  stream: { onDelta: (text: string) => void; signal: AbortSignal },
): Promise<AiRunResult> {
  return run('success_profile.create', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId,
    subject: { type: 'position', id: positionId },
    inputRefs: { ...plan.inputRefs, overriddenGuards: plan.overridden },
    onDelta: stream.onDelta,
    signal: stream.signal,
  });
}

export async function getSuccessProfileArtifact(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
) {
  await requirePosition(tx, actor, positionId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'success_profile',
    subject: { type: 'position', id: positionId },
  });
  return {
    artifactId: artifact?.id ?? null,
    approvedVersionId: artifact?.approvedVersionId ?? null,
  };
}
