// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  OFFER_MILESTONES,
  milestonesSchema,
  type AgencyActor,
  type Milestones,
  type OfferOutcome,
  type OfferOutcomeInput,
  type SaveOfferInput,
} from '@easemuse/core';
import type { Prisma } from '@prisma/client';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { requireEntry, transitionEntry } from '@/server/pipeline/service';
import { scheduleOfferReminder } from './reminders';

export interface OfferView {
  exists: boolean;
  state: string;
  milestones: Milestones;
  counterofferRisk: string | null;
  resignationDate: string | null;
  startDate: string | null;
  outcome: string | null;
  outcomeReason: string | null;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00Z`) : null;

/** The offer is managed from the moment the candidate is at "offer" until the placement is closed. */
const OFFER_STATES = ['offer', 'accepted', 'started', 'declined', 'reneged'];

export async function getOffer(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<OfferView> {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  const row = await tx.offer.findUnique({ where: { entryId } });
  return {
    exists: row !== null,
    state: entry.state,
    milestones: milestonesSchema.parse(row?.milestones ?? {}),
    counterofferRisk: row?.counterofferRisk ?? null,
    resignationDate: day(row?.resignationDate ?? null),
    startDate: day(row?.startDate ?? null),
    outcome: row?.outcome ?? null,
    outcomeReason: row?.outcomeReason ?? null,
  };
}

/**
 * Saves the offer record (T-10-01, US-1001, FR-OFF-01): nine milestones with a status, date and notes,
 * plus counteroffer risk, resignation date and start date. Milestones not mentioned stay as they are.
 * Saving schedules the next reminder.
 */
export async function saveOffer(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: SaveOfferInput,
  now: Date = new Date(),
): Promise<OfferView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (!OFFER_STATES.includes(entry.state)) {
    throw new ApiError('conflict', 'Move the candidate to "offer" before tracking an offer', {
      status: 409,
    });
  }
  const existing = await tx.offer.findUnique({ where: { entryId } });
  const current = milestonesSchema.parse(existing?.milestones ?? {});
  const merged: Milestones = { ...current };
  for (const key of OFFER_MILESTONES) {
    const patch = input.milestones?.[key];
    if (patch) merged[key] = { ...current[key], ...patch };
  }
  const data = {
    milestones: merged as unknown as Prisma.InputJsonValue,
    ...(input.counterofferRisk !== undefined ? { counterofferRisk: input.counterofferRisk } : {}),
    ...(input.resignationDate !== undefined
      ? { resignationDate: toDate(input.resignationDate) }
      : {}),
    ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
  };
  await tx.offer.upsert({
    where: { entryId },
    create: { agencyId: actor.agencyId, entryId, ...data },
    update: data,
  });
  await scheduleOfferReminder(tx, actor.agencyId, entryId, now);
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'offer.saved',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { entryId },
  });
  return getOffer(tx, actor, entryId);
}

/**
 * The position is filled when the placements that were accepted reach the number of openings (FR-OFF-03).
 * If one of them falls through (declined after acceptance, reneged) a filled position goes back to
 * interviewing, because it has an opening again.
 */
async function syncPositionFilled(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<void> {
  const position = await tx.position.findUnique({
    where: { id: positionId },
    select: { status: true, openings: true },
  });
  if (!position || position.status === 'cancelled') return;
  const placed = await tx.pipelineEntry.count({
    where: { positionId, state: { in: ['accepted', 'started'] } },
  });
  const next =
    placed >= position.openings ? 'filled' : position.status === 'filled' ? 'interviewing' : null;
  if (!next || next === position.status) return;
  await tx.position.update({ where: { id: positionId }, data: { status: next } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: next === 'filled' ? 'position.filled' : 'position.reopened',
    entityType: 'position',
    entityId: positionId,
    data: { placed, openings: position.openings },
  });
}

const OUTCOME_STATE: Record<OfferOutcome, 'accepted' | 'declined' | 'reneged' | 'started'> = {
  accepted: 'accepted',
  declined: 'declined',
  reneged: 'reneged',
  started: 'started',
};

/**
 * Records an outcome (T-10-01, FR-OFF-03): accepted, declined (reason from the agency list), reneged
 * (reason) or started. Each is a recruiter action with a date and moves the candidate in the
 * pipeline, which enforces the order (only an accepted offer can start or be reneged). The
 * placement closes only on "started".
 */
export async function recordOutcome(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: OfferOutcomeInput,
  now: Date = new Date(),
): Promise<OfferView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (Date.parse(`${input.at}T00:00:00Z`) > now.getTime() + 86_400_000) {
    throw new ApiError('invalid_input', 'The date cannot be in the future', {
      status: 422,
      fields: { at: 'Cannot be in the future' },
    });
  }
  await transitionEntry(tx, actor, entryId, {
    to: OUTCOME_STATE[input.outcome],
    ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  });
  const existing = await tx.offer.findUnique({ where: { entryId } });
  const milestones = milestonesSchema.parse(existing?.milestones ?? {});
  if (input.outcome === 'accepted') {
    milestones.offerAcceptance = { ...milestones.offerAcceptance, status: 'done', date: input.at };
  }
  if (input.outcome === 'started') {
    milestones.onboarding = { ...milestones.onboarding, status: 'done', date: input.at };
  }
  const data = {
    milestones: milestones as unknown as Prisma.InputJsonValue,
    outcome: input.outcome,
    outcomeReason: input.reason ?? input.reasonCode ?? null,
    ...(input.outcome === 'started' ? { startDate: toDate(input.at) } : {}),
  };
  await tx.offer.upsert({
    where: { entryId },
    create: { agencyId: actor.agencyId, entryId, ...data },
    update: data,
  });
  await syncPositionFilled(tx, actor, entry.positionId);
  await scheduleOfferReminder(tx, actor.agencyId, entryId, now);
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: `offer.${input.outcome}`,
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { entryId, at: input.at },
  });
  return getOffer(tx, actor, entryId);
}
