// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { nextOfferReminder } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Keeps one open "offer milestone" task for the candidate: the next of the check-in after the
 * resignation, the week before the start and the day after it (FR-OFF-02, US-1002). Called when the
 * offer is saved and when a reminder is completed, so the next one appears. Lives apart from the
 * task and offer services so both can use it.
 */
export async function scheduleOfferReminder(
  tx: ScopedTx,
  agencyId: string,
  entryId: string,
  now: Date = new Date(),
  after?: Date,
): Promise<void> {
  const entry = await tx.pipelineEntry.findUnique({
    where: { id: entryId },
    select: { ownerId: true },
  });
  if (!entry) return;
  await tx.task.updateMany({
    where: {
      kind: 'offer_milestone',
      entityType: 'pipeline_entry',
      entityId: entryId,
      completedAt: null,
    },
    data: { completedAt: now },
  });
  const offer = await tx.offer.findUnique({ where: { entryId } });
  if (!offer) return;
  const next = nextOfferReminder(
    {
      resignationDate: iso(offer.resignationDate),
      startDate: iso(offer.startDate),
      outcome: offer.outcome,
    },
    now,
    after,
  );
  if (!next) return;
  await tx.task.create({
    data: {
      agencyId,
      ownerId: entry.ownerId,
      kind: 'offer_milestone',
      entityType: 'pipeline_entry',
      entityId: entryId,
      dueAt: next.dueAt,
    },
  });
}
