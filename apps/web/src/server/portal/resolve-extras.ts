// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  CANDIDATE_UPDATE_FIELDS,
  candidateProfileContentSchema,
  type AgencyActor,
  type ResolveSlotProposalInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import {
  addDraftVersion,
  approveVersion,
  findArtifact,
  readApproved,
} from '@/server/artifacts/service';
import { createInterview } from '@/server/interviews/service';
import { requireEntry } from '@/server/pipeline/service';

/**
 * The recruiter's side of the portal extras: the interview times a hiring manager offered and what
 * a candidate said changed about them. Both are proposals; this is where they become real, only
 * when a recruiter says so (brief 1.1).
 */
export interface SlotProposalView {
  id: string;
  entryId: string;
  positionId: string;
  candidateName: string;
  positionTitle: string;
  roundName: string | null;
  format: string | null;
  slots: string[];
  note: string | null;
  proposedBy: string | null;
  createdAt: Date;
}

const asSlots = (json: unknown): string[] =>
  Array.isArray(json) ? json.filter((v): v is string => typeof v === 'string') : [];

/** Offers of interview times nobody has answered yet; a recruiter sees those of their own candidates. */
export async function listOpenSlotProposals(
  tx: ScopedTx,
  actor: AgencyActor,
): Promise<SlotProposalView[]> {
  const rows = await tx.interviewSlotProposal.findMany({
    where: {
      resolvedAt: null,
      ...(actor.role === 'recruiter' ? { entry: { ownerId: actor.userId } } : {}),
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      entry: {
        select: {
          positionId: true,
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
    positionId: r.entry.positionId,
    candidateName: r.entry.candidate.fullName,
    positionTitle: r.entry.position.title,
    roundName: r.roundName,
    format: r.format,
    slots: asSlots(r.slots),
    note: r.note,
    proposedBy: names.get(r.proposedBy) ?? null,
    createdAt: r.createdAt,
  }));
}

/**
 * Confirms one of the offered times, which creates the interview round (with all its rules), or
 * declines them all (US-1406, FR-HMP-06). A time that has passed since is refused with 409.
 */
export async function resolveSlotProposal(
  tx: ScopedTx,
  actor: AgencyActor,
  proposalId: string,
  input: ResolveSlotProposalInput,
  now: Date = new Date(),
): Promise<{ interviewId: string | null }> {
  const proposal = await tx.interviewSlotProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw notFound('Proposal');
  if (proposal.resolvedAt)
    throw new ApiError('conflict', 'This proposal was already answered', { status: 409 });
  const entry = await requireEntry(tx, actor, proposal.entryId, 'edit');
  let interviewId: string | null = null;
  let chosen: number | null = null;
  if (input.decision === 'confirm') {
    const slots = asSlots(proposal.slots);
    const slot = slots[input.slotIndex];
    if (!slot) throw new ApiError('invalid_input', 'That time was not offered', { status: 422 });
    if (new Date(slot).getTime() <= now.getTime()) {
      throw new ApiError('conflict', 'That time has passed; choose another or decline', {
        status: 409,
      });
    }
    const rounds = await tx.interview.count({ where: { entryId: entry.id } });
    const created = await createInterview(tx, actor, entry.id, {
      roundName: proposal.roundName ?? `Interview round ${rounds + 1}`,
      scheduledAt: new Date(slot),
      format: proposal.format,
      interviewers: input.interviewers,
    });
    interviewId = created.id;
    chosen = input.slotIndex;
  }
  await tx.interviewSlotProposal.update({
    where: { id: proposalId },
    data: { resolvedAt: now, resolvedById: actor.userId, chosenSlot: chosen, interviewId },
  });
  await tx.task.updateMany({
    where: {
      kind: 'proposal',
      entityType: 'pipeline_entry',
      entityId: entry.id,
      completedAt: null,
    },
    data: { completedAt: now },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action:
      input.decision === 'confirm'
        ? 'portal.interview_time_confirmed'
        : 'portal.interview_times_declined',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { proposalId, ...(interviewId ? { interviewId } : {}) },
  });
  return { interviewId };
}

export interface CandidateUpdateView {
  id: string;
  changes: Partial<Record<(typeof CANDIDATE_UPDATE_FIELDS)[number], string>>;
  createdAt: Date;
}

const changesOf = (json: unknown): CandidateUpdateView['changes'] => {
  const source = (json ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    CANDIDATE_UPDATE_FIELDS.flatMap((k) =>
      typeof source[k] === 'string' ? [[k, source[k] as string]] : [],
    ),
  );
};

/** What the candidate says changed, waiting for a recruiter. */
export async function listCandidateUpdates(
  tx: ScopedTx,
  candidateId: string,
): Promise<CandidateUpdateView[]> {
  const rows = await tx.candidateUpdateProposal.findMany({
    where: { candidateId, resolvedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map((r) => ({ id: r.id, changes: changesOf(r.changes), createdAt: r.createdAt }));
}

/**
 * Accepts or declines what a candidate said changed (US-1504, FR-CDP-04). Accepting puts the
 * change into the profile the way a recruiter's own edit would: contact details, compensation and
 * work authorization become a new approved version of the profile (the original resume file is
 * never touched), availability goes to the candidate record. Declining changes nothing.
 */
export async function resolveCandidateUpdate(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  updateId: string,
  accept: boolean,
  now: Date = new Date(),
): Promise<void> {
  const proposal = await tx.candidateUpdateProposal.findFirst({
    where: { id: updateId, candidateId },
  });
  if (!proposal) throw notFound('Update');
  if (proposal.resolvedAt)
    throw new ApiError('conflict', 'This update was already answered', { status: 409 });
  const changes = changesOf(proposal.changes);

  if (accept) {
    const profileFields = (
      ['email', 'phone', 'compensationExpectation', 'workAuthorization'] as const
    ).filter((k) => changes[k] !== undefined);
    if (profileFields.length > 0) {
      const approved = await readApproved(tx, {
        kind: 'candidate_profile',
        subject: { type: 'candidate', id: candidateId },
      });
      const artifact = await findArtifact(tx, {
        kind: 'candidate_profile',
        subject: { type: 'candidate', id: candidateId },
      });
      if (!approved || !artifact) {
        throw new ApiError(
          'conflict',
          "Confirm the candidate's profile first; these details belong in it",
          { status: 409 },
        );
      }
      const content = candidateProfileContentSchema.parse({
        ...approved.content,
        ...Object.fromEntries(profileFields.map((k) => [k, changes[k]])),
      });
      const version = await addDraftVersion(tx, {
        agencyId: actor.agencyId,
        artifactId: artifact.id,
        content,
        origin: 'human',
        createdById: actor.userId,
        parentVersionId: approved.id,
      });
      await approveVersion(tx, actor, version.id, { now });
    }
    if (changes.availability !== undefined) {
      await tx.candidate.update({
        where: { id: candidateId },
        data: { availability: changes.availability },
      });
    }
  }

  await tx.candidateUpdateProposal.update({
    where: { id: updateId },
    data: { resolvedAt: now, resolvedById: actor.userId, accepted: accept },
  });
  const stillOpen = await tx.candidateUpdateProposal.count({
    where: { candidateId, resolvedAt: null },
  });
  if (stillOpen === 0) {
    await tx.task.updateMany({
      where: {
        kind: 'proposal',
        entityType: 'candidate',
        entityId: candidateId,
        completedAt: null,
      },
      data: { completedAt: now },
    });
  }
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: accept ? 'portal.candidate_update_accepted' : 'portal.candidate_update_declined',
    entityType: 'candidate',
    entityId: candidateId,
    data: { updateId, fields: Object.keys(changes) },
  });
}
