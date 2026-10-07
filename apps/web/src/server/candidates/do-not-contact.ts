// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, DoNotContactInput } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';

export interface DoNotContactView {
  doNotContact: boolean;
  reason: string | null;
  at: Date | null;
}

/**
 * The do-not-contact flag (T-2-11, US-208, FR-SRC-09): any member can set it, only an admin can
 * clear it, and both need a reason. Outreach drafting and sending check the flag later (FR-OUT-07).
 * The reason and time stay on the timeline even after the flag is cleared.
 */
export async function setDoNotContact(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  input: DoNotContactInput,
  now: Date = new Date(),
): Promise<DoNotContactView> {
  const candidate = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { status: true, doNotContact: true },
  });
  if (!candidate || candidate.status === 'discarded') throw notFound('Candidate');
  if (candidate.status !== 'active') {
    throw new ApiError('conflict', 'Confirm the candidate first', { status: 409 });
  }
  if (!input.value && actor.role !== 'admin') {
    throw forbidden('Only an admin can clear do-not-contact');
  }
  if (candidate.doNotContact === input.value) {
    throw new ApiError(
      'conflict',
      input.value ? 'Already marked do not contact' : 'Not marked do not contact',
      { status: 409 },
    );
  }
  const row = await tx.candidate.update({
    where: { id: candidateId },
    data: input.value
      ? { doNotContact: true, doNotContactReason: input.reason, doNotContactAt: now }
      : { doNotContact: false, doNotContactReason: null, doNotContactAt: null },
    select: { doNotContact: true, doNotContactReason: true, doNotContactAt: true },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: input.value ? 'candidate.do_not_contact_set' : 'candidate.do_not_contact_cleared',
    entityType: 'candidate',
    entityId: candidateId,
    data: { reason: input.reason },
  });
  return { doNotContact: row.doNotContact, reason: row.doNotContactReason, at: row.doNotContactAt };
}
