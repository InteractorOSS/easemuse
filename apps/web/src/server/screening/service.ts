// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  SCREENING_ITEMS,
  screeningItemsSchema,
  type AgencyActor,
  type ClassificationInput,
  type ScreeningInput,
  type ScreeningItems,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { requireEntry, transitionEntry } from '@/server/pipeline/service';

export interface ScreeningView {
  items: ScreeningItems;
  /** The recruiter's classification (Priority, Potential, Hold, Not Qualified), if made. */
  screeningClass: string | null;
  updatedAt: Date | null;
}

export async function getScreening(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<ScreeningView> {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  const row = await tx.screeningAssessment.findUnique({
    where: { entryId },
    select: { items: true, updatedAt: true },
  });
  return {
    items: screeningItemsSchema.parse(row?.items ?? {}),
    screeningClass: entry.screeningClass,
    updatedAt: row?.updatedAt ?? null,
  };
}

/**
 * Saves the screening checklist (T-4-01, US-401). Items in the request replace those items; an item
 * with neither rating nor notes is removed; the others stay. The ratings are the recruiter's own
 * reading: nothing here is filled by AI, and nothing here moves the candidate (brief 6).
 */
export async function saveScreening(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: ScreeningInput,
): Promise<ScreeningView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const existing = await tx.screeningAssessment.findUnique({
    where: { entryId },
    select: { items: true },
  });
  const merged: Record<string, unknown> = { ...screeningItemsSchema.parse(existing?.items ?? {}) };
  const changed: string[] = [];
  for (const key of SCREENING_ITEMS) {
    const next = input.items[key];
    if (next === undefined) continue;
    const empty = !next.rating && !(next.notes && next.notes !== '');
    if (empty) delete merged[key];
    else
      merged[key] = {
        ...(next.rating ? { rating: next.rating } : {}),
        ...(next.notes ? { notes: next.notes } : {}),
      };
    changed.push(key);
  }
  const items = merged as unknown as Prisma.InputJsonValue;
  const row = await tx.screeningAssessment.upsert({
    where: { entryId },
    create: { agencyId: actor.agencyId, entryId, items },
    update: { items },
    select: { items: true, updatedAt: true },
  });
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'screening.saved',
      entityType: type,
      entityId: id,
      data: { entryId, items: changed },
    });
  }
  return {
    items: screeningItemsSchema.parse(row.items),
    screeningClass: entry.screeningClass,
    updatedAt: row.updatedAt,
  };
}

/**
 * Classifies a candidate (T-4-02, FR-SCR-02): a recruiter's call, recorded as a move to "screened"
 * with the class. A candidate who is already screened can be reclassified (the change is kept in the
 * history with the old and new class). Not Qualified always carries a reason. Only Priority and
 * Potential candidates may continue to outreach (enforced in `transitionEntry`).
 */
export async function classifyEntry(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: ClassificationInput,
): Promise<ScreeningView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (!['sourced', 'reviewed', 'screened'].includes(entry.state)) {
    throw new ApiError('conflict', 'A candidate that has moved on is no longer classified here', {
      status: 409,
    });
  }
  const before = entry.screeningClass;
  if (entry.state !== 'screened') {
    await transitionEntry(tx, actor, entryId, {
      to: 'screened',
      ...(input.reason ? { reason: input.reason } : {}),
    });
  } else if (before === input.screeningClass) {
    throw new ApiError('conflict', 'The candidate already has this classification', {
      status: 409,
    });
  } else {
    await tx.pipelineTransition.create({
      data: {
        agencyId: actor.agencyId,
        entryId,
        fromState: 'screened',
        toState: 'screened',
        actorId: actor.userId,
        reason: `Reclassified from ${before ?? 'none'} to ${input.screeningClass}${input.reason ? `: ${input.reason}` : ''}`,
      },
    });
  }
  await tx.pipelineEntry.update({
    where: { id: entryId },
    data: { screeningClass: input.screeningClass },
  });
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'screening.classified',
      entityType: type,
      entityId: id,
      data: {
        entryId,
        from: before,
        to: input.screeningClass,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
  }
  return getScreening(tx, actor, entryId);
}
