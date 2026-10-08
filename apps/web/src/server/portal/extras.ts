// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  CANDIDATE_UPDATE_FIELDS,
  INTAKE_TOPICS,
  intakeProposalsSchema,
  type CandidateUpdateInput,
  type HmIntakeAnswersInput,
  type PortalActor,
  type ProposeSlotsInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { audience, myShare, notify } from './actions';

/**
 * What the portals can add to the agency's records without anyone deciding for the recruiter
 * (brief 1.1, FR-HMP-03, FR-HMP-06, FR-CDP-04): the hiring manager's answers to the intake
 * questionnaire, the interview times the hiring manager offers, and what a candidate says changed
 * about them. Every one of these is stored as a PROPOSAL beside the real record; the real record
 * changes only when a recruiter accepts (see `resolve-extras.ts` and `positions/intake.ts`).
 */

/** The hiring manager answers the intake questionnaire online (US-1403). Answers wait for the recruiter. */
export async function submitIntakeAnswers(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
  input: HmIntakeAnswersInput,
  now: Date = new Date(),
): Promise<{ topics: string[] }> {
  audience(actor, 'hiring_manager');
  const { row, snapshot } = await myShare(tx, actor, shareId, 'intake_form');
  if (snapshot.kind !== 'intake_form') throw notFound('Share');
  const asked = new Set<string>(snapshot.topics.map((t) => t.key));
  const topics = INTAKE_TOPICS.filter((t) => input.answers[t]);
  if (topics.some((t) => !asked.has(t))) {
    throw new ApiError('invalid_input', 'That topic is not part of this questionnaire', {
      status: 422,
    });
  }
  const position = await tx.position.findUniqueOrThrow({
    where: { id: row.subjectId },
    select: { ownerId: true },
  });
  const record = await tx.intakeRecord.findUnique({
    where: { positionId: row.subjectId },
    select: { proposals: true },
  });
  const proposals = intakeProposalsSchema.parse(record?.proposals ?? {});
  for (const topic of topics) {
    const answer = input.answers[topic]!;
    proposals[topic] = {
      value: answer.value,
      ...(answer.stages ? { stages: answer.stages } : {}),
      proposedBy: actor.portalUserId,
      at: now.toISOString(),
    };
  }
  const json = proposals as unknown as Prisma.InputJsonValue;
  await tx.intakeRecord.upsert({
    where: { positionId: row.subjectId },
    create: { agencyId: actor.agencyId, positionId: row.subjectId, answers: {}, proposals: json },
    update: { proposals: json },
  });
  await notify(tx, {
    agencyId: actor.agencyId,
    ownerId: position.ownerId,
    kind: 'proposal',
    entityType: 'position',
    entityId: row.subjectId,
    now,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: 'portal.intake_answers_proposed',
    entityType: 'position',
    entityId: row.subjectId,
    data: { topics },
  });
  return { topics };
}

/** Candidates in these states can be interviewed (the same as the recruiter's own rule). */
const INTERVIEW_STATES = ['submitted', 'interviewing', 'on_hold'];

/**
 * The hiring manager offers up to five times for the next interview round (US-1406, FR-HMP-06).
 * Nothing is scheduled: the recruiter confirms one, or none. One offer at a time per candidate.
 */
export async function proposeSlots(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
  input: ProposeSlotsInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  audience(actor, 'hiring_manager');
  const { row } = await myShare(tx, actor, shareId, 'submission');
  const entry = await tx.pipelineEntry.findUniqueOrThrow({
    where: { id: row.subjectId },
    select: { state: true, ownerId: true, candidateId: true },
  });
  if (!INTERVIEW_STATES.includes(entry.state)) {
    throw new ApiError('conflict', 'Interview times cannot be offered for this candidate now', {
      status: 409,
    });
  }
  if (input.slots.some((s) => s.getTime() <= now.getTime())) {
    throw new ApiError('invalid_input', 'Offer times that are still ahead', {
      status: 422,
      fields: { slots: 'Must be in the future' },
    });
  }
  const open = await tx.interviewSlotProposal.findFirst({
    where: { entryId: row.subjectId, resolvedAt: null },
    select: { id: true },
  });
  if (open) {
    throw new ApiError('conflict', 'Times are already waiting for the recruiter', { status: 409 });
  }
  const proposal = await tx.interviewSlotProposal.create({
    data: {
      agencyId: actor.agencyId,
      entryId: row.subjectId,
      proposedBy: actor.portalUserId,
      roundName: input.roundName ?? null,
      format: input.format ?? null,
      slots: input.slots.map((s) => s.toISOString()).sort() as unknown as Prisma.InputJsonValue,
      note: input.note ?? null,
    },
  });
  await notify(tx, {
    agencyId: actor.agencyId,
    ownerId: entry.ownerId,
    kind: 'proposal',
    entityType: 'pipeline_entry',
    entityId: row.subjectId,
    now,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: 'portal.interview_times_proposed',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { proposalId: proposal.id, count: input.slots.length },
  });
  return { id: proposal.id };
}

export interface MyUpdateView {
  id: string;
  changes: Partial<Record<(typeof CANDIDATE_UPDATE_FIELDS)[number], string>>;
  status: 'waiting' | 'accepted' | 'declined';
  createdAt: Date;
}

const pickChanges = (json: unknown): MyUpdateView['changes'] => {
  const source = (json ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    CANDIDATE_UPDATE_FIELDS.flatMap((k) =>
      typeof source[k] === 'string' ? [[k, source[k] as string]] : [],
    ),
  );
};

async function candidateOf(tx: ScopedTx, actor: PortalActor): Promise<string> {
  const user = await tx.portalUser.findUniqueOrThrow({
    where: { id: actor.portalUserId },
    select: { candidateId: true },
  });
  if (!user.candidateId) throw notFound('Candidate');
  return user.candidateId;
}

/** The candidate's own updates, newest first, and whether the recruiter has answered each. */
export async function listMyUpdates(tx: ScopedTx, actor: PortalActor): Promise<MyUpdateView[]> {
  audience(actor, 'candidate');
  const candidateId = await candidateOf(tx, actor);
  const rows = await tx.candidateUpdateProposal.findMany({
    where: { candidateId, proposedBy: actor.portalUserId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    changes: pickChanges(r.changes),
    status: r.resolvedAt === null ? 'waiting' : r.accepted ? 'accepted' : 'declined',
    createdAt: r.createdAt,
  }));
}

/**
 * The candidate says what changed: contact details, availability, compensation expectation, work
 * authorization (US-1504, FR-CDP-04). It arrives as a proposal; a second submission while one is
 * waiting replaces the fields it names, so the candidate can correct a typo before the recruiter looks.
 */
export async function proposeCandidateUpdate(
  tx: ScopedTx,
  actor: PortalActor,
  input: CandidateUpdateInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  audience(actor, 'candidate');
  const candidateId = await candidateOf(tx, actor);
  const changes = Object.fromEntries(
    CANDIDATE_UPDATE_FIELDS.flatMap((k) => (input[k] !== undefined ? [[k, input[k]]] : [])),
  );
  const open = await tx.candidateUpdateProposal.findFirst({
    where: { candidateId, proposedBy: actor.portalUserId, resolvedAt: null },
  });
  const saved = open
    ? await tx.candidateUpdateProposal.update({
        where: { id: open.id },
        data: { changes: { ...pickChanges(open.changes), ...changes } as Prisma.InputJsonValue },
      })
    : await tx.candidateUpdateProposal.create({
        data: {
          agencyId: actor.agencyId,
          candidateId,
          proposedBy: actor.portalUserId,
          changes: changes as Prisma.InputJsonValue,
        },
      });
  // The recruiter who works with this candidate most recently hears about it.
  const entry = await tx.pipelineEntry.findFirst({
    where: { candidateId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { ownerId: true },
  });
  const candidate = await tx.candidate.findUniqueOrThrow({
    where: { id: candidateId },
    select: { createdById: true },
  });
  await notify(tx, {
    agencyId: actor.agencyId,
    ownerId: entry?.ownerId ?? candidate.createdById,
    kind: 'proposal',
    entityType: 'candidate',
    entityId: candidateId,
    now,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: 'portal.candidate_update_proposed',
    entityType: 'candidate',
    entityId: candidateId,
    // The names of the fields only; the values are personal and stay in the proposal.
    data: { proposalId: saved.id, fields: Object.keys(changes) },
  });
  return { id: saved.id };
}
