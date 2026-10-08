// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { REPLY_NOTICED } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { logActivity } from '@/server/activity/service';
import { createTask } from '@/server/tasks/service';

/**
 * A reply to a sent touch was noticed in the recruiter's connected mailbox (T-5-12, FR-MSG-04). The
 * sequence stops (FR-OUT-05) and the recruiter gets a task to read it. The system does not decide what
 * the reply means or move the candidate: the touch is marked "replied" and the recruiter classifies it
 * (interested, not now...), which is the step that can move the candidate (brief §1.1).
 * Returns false when the touch already has an answer or is not a sent touch.
 */
export async function noteReply(
  tx: ScopedTx,
  input: { agencyId: string; touchId: string },
  now: Date = new Date(),
): Promise<boolean> {
  const touch = await tx.outreachTouch.findUnique({
    where: { id: input.touchId },
    select: {
      id: true,
      entryId: true,
      touchNumber: true,
      status: true,
      response: true,
      entry: { select: { ownerId: true, candidateId: true } },
    },
  });
  if (!touch || touch.status !== 'sent' || touch.response !== null) return false;
  await tx.outreachTouch.update({ where: { id: touch.id }, data: { response: REPLY_NOTICED } });
  await tx.outreachTouch.updateMany({
    where: { entryId: touch.entryId, status: { in: ['planned', 'drafted'] } },
    data: { status: 'cancelled' },
  });
  await tx.task.updateMany({
    where: {
      ownerId: touch.entry.ownerId,
      kind: 'outreach_due',
      entityType: 'pipeline_entry',
      entityId: touch.entryId,
      completedAt: null,
    },
    data: { completedAt: now },
  });
  await createTask(tx, {
    agencyId: input.agencyId,
    ownerId: touch.entry.ownerId,
    kind: 'reply_received',
    entityType: 'pipeline_entry',
    entityId: touch.entryId,
    dueAt: now,
  });
  await logActivity(tx, {
    agencyId: input.agencyId,
    actor: { type: 'system', id: null },
    action: 'outreach.reply_noticed',
    entityType: 'candidate',
    entityId: touch.entry.candidateId,
    data: { entryId: touch.entryId, touchNumber: touch.touchNumber },
  });
  return true;
}
