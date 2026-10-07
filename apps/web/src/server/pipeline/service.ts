// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  PIPELINE_TRANSITIONS,
  REASON_CODE_REQUIRED,
  REASON_TEXT_REQUIRED,
  TERMINAL_STATES,
  type AddToPositionInput,
  type AgencyActor,
  type PipelineState,
  type PipelineTransitionInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { channels } from '@/lib/realtime/channels';
import { publish } from '@/lib/realtime/publish';
import { logActivity } from '@/server/activity/service';
import { applyGuards } from '@/server/guards';
import { requirePosition } from '@/server/positions/service';
import { getAgencySettings } from '@/server/tenancy/settings';
import { unsatisfiedGuards } from './guards';

/**
 * The pipeline (T-3-01, handoff section 3, T-2-07): one entry per candidate per position, moved only
 * by a recruiter. A move is ONE service call that checks the state map, the reasons and the guards,
 * then writes the entry, the PipelineTransition history, the timeline and the live update in one
 * transaction. No AI result ever moves a candidate (brief 1.1).
 */
export interface PipelineEntryView {
  id: string;
  positionId: string;
  candidateId: string;
  candidateName: string;
  ownerId: string;
  state: PipelineState;
  screeningClass: string | null;
  manualRank: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const select = {
  id: true,
  positionId: true,
  candidateId: true,
  ownerId: true,
  state: true,
  screeningClass: true,
  manualRank: true,
  createdAt: true,
  updatedAt: true,
  candidate: { select: { fullName: true } },
} satisfies Prisma.PipelineEntrySelect;
type Row = Prisma.PipelineEntryGetPayload<{ select: typeof select }>;

const toView = ({ candidate, ...e }: Row): PipelineEntryView => ({
  ...e,
  state: e.state as PipelineState,
  candidateName: candidate.fullName,
});

const isManager = (actor: AgencyActor) => actor.role === 'admin' || actor.role === 'lead';

/** An entry in a position the person may see; one they may not see is a 404, like one that does not exist. */
async function loadEntry(tx: ScopedTx, actor: AgencyActor, entryId: string): Promise<Row> {
  const row = await tx.pipelineEntry.findUnique({ where: { id: entryId }, select });
  if (!row) throw notFound('Pipeline entry');
  await requirePosition(tx, actor, row.positionId, 'read');
  return row;
}

export async function getEntry(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<PipelineEntryView> {
  return toView(await loadEntry(tx, actor, entryId));
}

/** Everyone in a position's pipeline, oldest first (the dashboard read model comes with T-3-07). */
export async function listPositionPipeline(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<PipelineEntryView[]> {
  await requirePosition(tx, actor, positionId, 'read');
  const rows = await tx.pipelineEntry.findMany({
    where: { positionId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select,
  });
  return rows.map(toView);
}

/**
 * Adds a confirmed candidate to a position, in state "sourced" (US-204). The same person can be in
 * several positions, each with its own state; twice in the same position is a 409.
 */
export async function addCandidateToPosition(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  input: AddToPositionInput,
): Promise<PipelineEntryView> {
  const position = await requirePosition(tx, actor, positionId, 'read');
  if (position.status === 'filled' || position.status === 'cancelled') {
    throw new ApiError('conflict', 'This position is closed', { status: 409 });
  }
  const candidate = await tx.candidate.findUnique({
    where: { id: input.candidateId },
    select: { status: true, mergedIntoId: true },
  });
  if (!candidate || candidate.status === 'discarded' || candidate.mergedIntoId)
    throw notFound('Candidate');
  if (candidate.status !== 'active') {
    throw new ApiError('conflict', 'Confirm the candidate before adding them to a position', {
      status: 409,
    });
  }
  const existing = await tx.pipelineEntry.findUnique({
    where: { positionId_candidateId: { positionId, candidateId: input.candidateId } },
    select: { id: true },
  });
  if (existing)
    throw new ApiError('conflict', 'This candidate is already in this position', { status: 409 });

  const row = await tx.pipelineEntry.create({
    data: {
      agencyId: actor.agencyId,
      positionId,
      candidateId: input.candidateId,
      ownerId: actor.userId,
    },
    select,
  });
  await tx.pipelineTransition.create({
    data: {
      agencyId: actor.agencyId,
      entryId: row.id,
      fromState: null,
      toState: 'sourced',
      actorId: actor.userId,
    },
  });
  for (const [type, id] of [
    ['candidate', input.candidateId],
    ['position', positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'pipeline.added',
      entityType: type,
      entityId: id,
      data: { entryId: row.id, positionId, candidateId: input.candidateId },
    });
  }
  await publish(tx, channels.position(actor.agencyId, positionId), 'pipeline.added', {
    entryId: row.id,
    candidateId: input.candidateId,
  });
  return toView(row);
}

/**
 * Moves an entry to a new state (api-contracts: `POST /pipeline/:entryId/transitions`). Allowed for
 * the entry's owner, a lead or an admin. 409 `invalid_transition` for a move the state map does not
 * allow; 422 when the agency's reason is missing; 409 `guard_failed` while a guard is unmet, unless
 * the agency set it to "warn" and an override with a reason is given.
 */
export async function transitionEntry(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: PipelineTransitionInput,
): Promise<PipelineEntryView> {
  const entry = await loadEntry(tx, actor, entryId);
  if (!isManager(actor) && entry.ownerId !== actor.userId) {
    throw forbidden('Only the owner, a lead or an admin can move this candidate');
  }
  const from = entry.state as PipelineState;
  if (!PIPELINE_TRANSITIONS[from].includes(input.to)) {
    const finished = TERMINAL_STATES.includes(from);
    throw new ApiError(
      'invalid_transition',
      finished
        ? `This candidate's process has ended (${from.replace('_', ' ')})`
        : `A candidate who is ${from.replace('_', ' ')} cannot move to ${input.to.replace('_', ' ')}`,
      { status: 409 },
    );
  }

  const settings = await getAgencySettings(tx, actor.agencyId);
  if (REASON_CODE_REQUIRED.includes(input.to)) {
    if (!input.reasonCode || !settings.rejectionReasons.includes(input.reasonCode)) {
      throw new ApiError('invalid_input', 'Choose a reason from the agency list', {
        status: 422,
        fields: { reasonCode: 'Choose a reason' },
      });
    }
  }
  if (REASON_TEXT_REQUIRED.includes(input.to) && !input.reason) {
    throw new ApiError('invalid_input', 'A reason is required', {
      status: 422,
      fields: { reason: 'Enter a reason' },
    });
  }

  const unmet = await unsatisfiedGuards({
    tx,
    actor,
    from,
    to: input.to,
    entry: { id: entry.id, positionId: entry.positionId, candidateId: entry.candidateId },
  });
  const overridden = applyGuards(unmet, settings.guardModes, input.overrideGuards);

  const row = await tx.pipelineEntry.update({
    where: { id: entryId },
    data: { state: input.to },
    select,
  });
  await tx.pipelineTransition.create({
    data: {
      agencyId: actor.agencyId,
      entryId,
      fromState: from,
      toState: input.to,
      actorId: actor.userId,
      reasonCode: input.reasonCode ?? null,
      reason: input.reason ?? null,
      ...(overridden.length ? { overrides: overridden as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  const data = {
    entryId,
    positionId: entry.positionId,
    from,
    to: input.to,
    ...(overridden.length ? { overriddenGuards: overridden } : {}),
  };
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'pipeline.transition',
      entityType: type,
      entityId: id,
      data,
    });
  }
  await publish(tx, channels.position(actor.agencyId, entry.positionId), 'pipeline.transition', {
    entryId,
    from,
    to: input.to,
  });
  return toView(row);
}
