// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, ResolveProposalInput } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { requireEntry, transitionEntry } from '@/server/pipeline/service';
import { queuePortalNotice } from './notify';

export interface ProposalView {
  id: string;
  entryId: string;
  candidateName: string;
  positionTitle: string;
  toState: string;
  reason: string | null;
  proposedBy: string | null;
  createdAt: Date;
}

/** Decisions the hiring managers proposed that no recruiter has answered yet (FR-HMP-05). */
export async function listOpenProposals(tx: ScopedTx, actor: AgencyActor): Promise<ProposalView[]> {
  const rows = await tx.proposedTransition.findMany({
    where: {
      resolvedAt: null,
      ...(actor.role === 'recruiter' ? { entry: { ownerId: actor.userId } } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      entry: {
        select: {
          candidate: { select: { fullName: true } },
          position: { select: { title: true } },
        },
      },
    },
  });
  const names = new Map(
    (
      await tx.portalUser.findMany({
        where: { id: { in: rows.map((r) => r.proposedBy) } },
        select: { id: true, clientContact: { select: { name: true } } },
      })
    ).map((u) => [u.id, u.clientContact?.name ?? null]),
  );
  return rows.map((r) => ({
    id: r.id,
    entryId: r.entryId,
    candidateName: r.entry.candidate.fullName,
    positionTitle: r.entry.position.title,
    toState: r.toState,
    reason: r.reason,
    proposedBy: names.get(r.proposedBy) ?? null,
    createdAt: r.createdAt,
  }));
}

/**
 * The recruiter answers a hiring manager's proposal (FR-HMP-05, DP-1). Accepting makes the move in
 * the pipeline with all its rules (a rejection needs a reason from the agency's list); declining only
 * records that the recruiter did not follow it. Either way the proposal is closed and the reminder done.
 */
export async function resolveProposal(
  tx: ScopedTx,
  actor: AgencyActor,
  proposalId: string,
  input: ResolveProposalInput,
  now: Date = new Date(),
): Promise<{ notificationMessageId: string | null }> {
  const proposal = await tx.proposedTransition.findUnique({ where: { id: proposalId } });
  if (!proposal) throw notFound('Proposal');
  if (proposal.resolvedAt)
    throw new ApiError('conflict', 'This proposal was already answered', { status: 409 });
  const entry = await requireEntry(tx, actor, proposal.entryId, 'edit');
  if (input.accept) {
    await transitionEntry(tx, actor, proposal.entryId, {
      to: proposal.toState,
      ...(proposal.reason ? { reason: proposal.reason } : {}),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
    });
  }
  await tx.proposedTransition.update({
    where: { id: proposalId },
    data: { resolvedAt: now, resolvedById: actor.userId, accepted: input.accept },
  });
  await tx.task.updateMany({
    where: {
      kind: 'proposal',
      entityType: 'pipeline_entry',
      entityId: proposal.entryId,
      completedAt: null,
    },
    data: { completedAt: now },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: input.accept ? 'portal.proposal_accepted' : 'portal.proposal_declined',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { proposalId, toState: proposal.toState },
  });
  // The hiring manager who made the recommendation hears that it was answered (T-14-07).
  const notice = await queuePortalNotice(tx, {
    agencyId: actor.agencyId,
    senderId: actor.userId,
    portalUserId: proposal.proposedBy,
    notice: { type: 'answered' },
  });
  return { notificationMessageId: notice?.outboxMessageId ?? null };
}
