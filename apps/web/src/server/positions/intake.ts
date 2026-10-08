// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  INTAKE_TOPICS,
  intakeAnswersSchema,
  intakeProposalsSchema,
  type AgencyActor,
  type IntakeAnswers,
  type IntakeInput,
  type IntakeTopic,
  type RecordApprovalInput,
  type ResolveIntakeProposalInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { approvedJdVersionId } from './jd-approval';
import { requirePosition } from './service';

const isGuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

/** The hiring manager intake (T-1-09, brief 3.4) and the recorded JD approval (brief 3.4, FR-INT-10). */
export interface ApprovalView {
  id: string;
  decision: 'approved' | 'changes_requested';
  approverName: string;
  method: string | null;
  decidedAt: Date;
  comments: string | null;
  source: string;
  versionId: string;
  /** False when the structured JD was changed and approved again after this decision. */
  current: boolean;
}

/** A hiring manager's answer from the portal that the recruiter has not answered yet (FR-HMP-03). */
export interface IntakeProposalView {
  topic: IntakeTopic;
  value: string;
  stages?: string[];
  proposedBy: string | null;
  at: string;
}

export interface IntakeView {
  answers: IntakeAnswers;
  /** Answers from the hiring manager waiting for the recruiter; they change nothing until accepted. */
  proposals: IntakeProposalView[];
  /** The latest decision on the JD, if any. */
  jdApproval: ApprovalView | null;
}

/** Latest approval decision recorded for the position's JD, over all versions. */
async function latestApproval(tx: ScopedTx, positionId: string) {
  return tx.approval.findFirst({
    where: { subject: 'jd', subjectId: positionId },
    orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
}

export async function getIntake(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<IntakeView> {
  await requirePosition(tx, actor, positionId, 'read');
  const [record, approval, version] = await Promise.all([
    tx.intakeRecord.findUnique({
      where: { positionId },
      select: { answers: true, proposals: true },
    }),
    latestApproval(tx, positionId),
    approvedJdVersionId(tx, positionId),
  ]);
  const proposed = intakeProposalsSchema.parse(record?.proposals ?? {});
  const people = await tx.portalUser.findMany({
    where: {
      id: { in: [...new Set(Object.values(proposed).map((p) => p!.proposedBy))].filter(isGuid) },
    },
    select: { id: true, clientContact: { select: { name: true } } },
  });
  const names = new Map(people.map((u) => [u.id, u.clientContact?.name ?? null]));
  return {
    answers: intakeAnswersSchema.parse(record?.answers ?? {}),
    proposals: INTAKE_TOPICS.flatMap((topic) => {
      const p = proposed[topic];
      return p
        ? [
            {
              topic,
              value: p.value,
              ...(p.stages ? { stages: p.stages } : {}),
              proposedBy: names.get(p.proposedBy) ?? null,
              at: p.at,
            },
          ]
        : [];
    }),
    jdApproval: approval
      ? {
          id: approval.id,
          decision: approval.decision,
          approverName: approval.approverName,
          method: approval.method,
          decidedAt: approval.decidedAt,
          comments: approval.comments,
          source: approval.source,
          versionId: approval.versionId,
          current: approval.versionId === version,
        }
      : null,
  };
}

/** Saves the topics the recruiter filled in (the others keep their answer). Recruiter-entered answers are accepted at once. */
export async function saveIntake(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  input: IntakeInput,
): Promise<IntakeView> {
  await requirePosition(tx, actor, positionId, 'edit');
  const existing = await tx.intakeRecord.findUnique({
    where: { positionId },
    select: { answers: true },
  });
  const answers = intakeAnswersSchema.parse(existing?.answers ?? {});
  const changed: string[] = [];
  for (const topic of INTAKE_TOPICS) {
    const next = input.answers[topic];
    if (!next) continue;
    answers[topic] = {
      value: next.value,
      ...(next.stages ? { stages: next.stages } : {}),
      source: 'recruiter',
      status: 'accepted',
    };
    changed.push(topic);
  }
  const json = answers as unknown as Prisma.InputJsonValue;
  await tx.intakeRecord.upsert({
    where: { positionId },
    create: { agencyId: actor.agencyId, positionId, answers: json },
    update: { answers: json },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.intake_saved',
    entityType: 'position',
    entityId: positionId,
    data: { topics: changed },
  });
  return getIntake(tx, actor, positionId);
}

/**
 * Records the hiring manager's decision on the approved structured JD (the recruiter types in what
 * the manager said by email or phone). The decision is tied to the exact approved version, so a JD
 * edited afterwards needs a new decision. Needs an approved structured JD first.
 */
export async function recordJdApproval(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  input: RecordApprovalInput,
): Promise<ApprovalView> {
  await requirePosition(tx, actor, positionId, 'edit');
  const versionId = await approvedJdVersionId(tx, positionId);
  if (!versionId) {
    throw new ApiError(
      'conflict',
      'Approve the structured JD before recording the hiring manager decision',
      { status: 409 },
    );
  }
  if (input.decidedAt.getTime() > Date.now() + 60_000) {
    throw new ApiError('invalid_input', 'The decision date cannot be in the future', {
      status: 422,
      fields: { decidedAt: 'Cannot be in the future' },
    });
  }
  const row = await tx.approval.create({
    data: {
      agencyId: actor.agencyId,
      subject: 'jd',
      subjectId: positionId,
      versionId,
      decision: input.decision,
      comments: input.comments ?? null,
      source: 'recorded_by_recruiter',
      method: input.method,
      approverName: input.approverName,
      recordedById: actor.userId,
      decidedAt: input.decidedAt,
    },
  });
  await tx.intakeRecord.upsert({
    where: { positionId },
    create: { agencyId: actor.agencyId, positionId, answers: {}, jdApprovalId: row.id },
    update: { jdApprovalId: row.id },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'position.jd_approval_recorded',
    entityType: 'position',
    entityId: positionId,
    data: { decision: input.decision, method: input.method, versionId },
  });
  return {
    id: row.id,
    decision: row.decision,
    approverName: row.approverName,
    method: row.method,
    decidedAt: row.decidedAt,
    comments: row.comments,
    source: row.source,
    versionId,
    current: true,
  };
}

/**
 * The recruiter answers the hiring manager's answer to one intake topic (FR-HMP-03, brief 1.1).
 * Accepting copies it into the intake as "from the hiring manager" and replaces what was there for
 * that topic; declining only removes the proposal. Either way it is closed and logged.
 */
export async function resolveIntakeProposal(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  input: ResolveIntakeProposalInput,
): Promise<IntakeView> {
  await requirePosition(tx, actor, positionId, 'edit');
  const record = await tx.intakeRecord.findUnique({
    where: { positionId },
    select: { answers: true, proposals: true },
  });
  const proposals = intakeProposalsSchema.parse(record?.proposals ?? {});
  const proposal = proposals[input.topic];
  if (!record || !proposal) throw notFound('Proposed answer');
  const answers = intakeAnswersSchema.parse(record.answers ?? {});
  if (input.accept) {
    answers[input.topic] = {
      value: proposal.value,
      ...(proposal.stages ? { stages: proposal.stages } : {}),
      source: 'hm_portal',
      status: 'accepted',
    };
  }
  delete proposals[input.topic];
  await tx.intakeRecord.update({
    where: { positionId },
    data: {
      answers: answers as unknown as Prisma.InputJsonValue,
      proposals: proposals as unknown as Prisma.InputJsonValue,
    },
  });
  if (Object.values(proposals).every((p) => !p)) {
    await tx.task.updateMany({
      where: { kind: 'proposal', entityType: 'position', entityId: positionId, completedAt: null },
      data: { completedAt: new Date() },
    });
  }
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: input.accept
      ? 'position.intake_proposal_accepted'
      : 'position.intake_proposal_declined',
    entityType: 'position',
    entityId: positionId,
    data: { topic: input.topic },
  });
  return getIntake(tx, actor, positionId);
}
