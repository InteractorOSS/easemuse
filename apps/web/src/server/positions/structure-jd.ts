// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { JdStructureInput } from '@/server/ai/prompts/jd-structure';
import { requirePosition } from './service';

/** What the structure run needs, read before streaming starts so a refusal is an ordinary JSON error. */
export interface StructureJdPlan {
  input: JdStructureInput;
  inputRefs: { jobDescriptionId: string; positionId: string };
}

/**
 * Prepares A1 for a position (US-103): checks the person may edit it and picks the newest original
 * whose text has been read. With none, the answer is 422 `unreadable_document` so the UI can say to
 * add or paste the JD first.
 */
export async function planStructureJd(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<StructureJdPlan> {
  await requirePosition(tx, actor, positionId, 'edit');
  const [position, original] = await Promise.all([
    tx.position.findUniqueOrThrow({ where: { id: positionId } }),
    tx.jobDescription.findFirst({
      where: { positionId, kind: 'original', extractionStatus: 'ready', text: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, text: true },
    }),
  ]);
  if (!original?.text) {
    throw new ApiError(
      'unreadable_document',
      "Add the client's job description first (upload it or paste the text)",
      { status: 422 },
    );
  }
  const pay =
    position.compMin !== null || position.compMax !== null
      ? `${position.compMin ?? ''}-${position.compMax ?? ''} ${position.compCurrency}`
      : null;
  return {
    input: {
      jdText: original.text,
      position: {
        title: position.title,
        location: position.location,
        department: position.department,
        workArrangement: position.workArrangement,
        requiredExperience: position.requiredExperience,
        requiredSkills: position.requiredSkills,
        compensation: pay,
        workAuthorization: position.workAuthorization,
      },
    },
    inputRefs: { jobDescriptionId: original.id, positionId },
  };
}

export type StructureRunner = (
  purpose: 'jd.structure',
  input: JdStructureInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

/** Runs A1 and saves the answer as a draft `structured_jd` version of the position. */
export function runStructureJd(
  run: StructureRunner,
  actor: AgencyActor,
  positionId: string,
  plan: StructureJdPlan,
  stream: { onDelta: (text: string) => void; signal: AbortSignal },
): Promise<AiRunResult> {
  return run('jd.structure', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId,
    subject: { type: 'position', id: positionId },
    inputRefs: plan.inputRefs,
    onDelta: stream.onDelta,
    signal: stream.signal,
  });
}
