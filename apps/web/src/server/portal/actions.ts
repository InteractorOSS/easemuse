// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  FEEDBACK_CRITERIA,
  PRIVACY_DEADLINE_DAYS,
  PRIVACY_REMINDER_DAYS,
  portalSnapshotSchema,
  type PortalActor,
  type PortalConsentInput,
  type PortalDecisionInput,
  type PortalPrivacyInput,
  type HmDecisionInput,
  type HmFeedbackInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';

/**
 * What portal users can DO (ADR-003): a fixed set of actions per audience, each tied to a share
 * addressed to that person. None of them moves a candidate: a hiring manager's decision becomes a
 * proposal the recruiter confirms (FR-HMP-05, DP-1). Everything is recorded with the portal user.
 */
const DAY = 86_400_000;

export function audience(actor: PortalActor, expected: PortalActor['audience']) {
  if (actor.audience !== expected) throw forbidden('This is not available to you');
}

export async function myShare(tx: ScopedTx, actor: PortalActor, shareId: string, kind: string) {
  const row = await tx.portalShare.findFirst({
    where: { id: shareId, portalUserId: actor.portalUserId, revokedAt: null, kind },
  });
  const parsed = row ? portalSnapshotSchema.safeParse(row.snapshot) : null;
  if (!row || !parsed?.success) throw notFound('Share');
  return { row, snapshot: parsed.data };
}

export async function whoIs(tx: ScopedTx, actor: PortalActor): Promise<string> {
  const user = await tx.portalUser.findUniqueOrThrow({
    where: { id: actor.portalUserId },
    select: {
      clientContact: { select: { name: true } },
      candidate: { select: { fullName: true } },
      email: true,
    },
  });
  return user.clientContact?.name ?? user.candidate?.fullName ?? user.email;
}

/** A task for the person who works the item, so the recruiter sees it in "My tasks" (FR-HMP-02, FR-HMP-05). */
export async function notify(
  tx: ScopedTx,
  input: {
    agencyId: string;
    ownerId: string;
    kind: 'approval_received' | 'proposal';
    entityType: string;
    entityId: string;
    now: Date;
  },
) {
  const open = await tx.task.findFirst({
    where: {
      ownerId: input.ownerId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      completedAt: null,
    },
    select: { id: true },
  });
  if (open) return;
  await tx.task.create({
    data: {
      agencyId: input.agencyId,
      ownerId: input.ownerId,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      dueAt: input.now,
    },
  });
}

/**
 * The hiring manager approves the JD or asks for changes (US-1402, FR-HMP-02). Counts as the recorded
 * approval of FR-INT-10 for the version they saw; if the JD was approved again since, they are asked to
 * look at the new one first (409), so an approval never covers text they did not read.
 */
export async function decideJd(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
  decision: 'approved' | 'changes_requested',
  input: PortalDecisionInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  audience(actor, 'hiring_manager');
  const { row, snapshot } = await myShare(tx, actor, shareId, 'jd_for_approval');
  if (snapshot.kind !== 'jd_for_approval') throw notFound('Share');
  const artifact = await tx.artifact.findFirst({
    where: { kind: 'structured_jd', subjectType: 'position', subjectId: row.subjectId },
    orderBy: { createdAt: 'desc' },
    select: { approvedVersionId: true },
  });
  if (artifact?.approvedVersionId !== snapshot.versionId) {
    throw new ApiError(
      'stale_share',
      'The job description was updated. Open the new version first.',
      { status: 409 },
    );
  }
  const approval = await tx.approval.create({
    data: {
      agencyId: actor.agencyId,
      subject: 'jd',
      subjectId: row.subjectId,
      versionId: snapshot.versionId,
      decision,
      comments: input.comments ?? null,
      source: 'portal',
      method: null,
      approverName: await whoIs(tx, actor),
      portalUserId: actor.portalUserId,
      decidedAt: now,
    },
  });
  await tx.intakeRecord.upsert({
    where: { positionId: row.subjectId },
    create: {
      agencyId: actor.agencyId,
      positionId: row.subjectId,
      answers: {},
      jdApprovalId: approval.id,
    },
    update: { jdApprovalId: approval.id },
  });
  const position = await tx.position.findUniqueOrThrow({
    where: { id: row.subjectId },
    select: { ownerId: true },
  });
  await notify(tx, {
    agencyId: actor.agencyId,
    ownerId: position.ownerId,
    kind: 'approval_received',
    entityType: 'position',
    entityId: row.subjectId,
    now,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: 'position.jd_approval_recorded',
    entityType: 'position',
    entityId: row.subjectId,
    data: { decision, via: 'portal', versionId: snapshot.versionId },
  });
  return { id: approval.id };
}

/**
 * The candidate approves the tailored resume or asks for changes (US-1502, FR-CDP-02). Bound to the
 * version they saw, like the recorded approval of the recruiter path (FR-RES-03), and it is the same
 * record the submission guard reads.
 */
export async function decideResume(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
  decision: 'approved' | 'changes_requested',
  input: PortalDecisionInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  audience(actor, 'candidate');
  const { row, snapshot } = await myShare(tx, actor, shareId, 'tailored_resume');
  if (snapshot.kind !== 'tailored_resume') throw notFound('Share');
  const artifact = await tx.artifact.findFirst({
    where: { kind: 'tailored_resume', subjectType: 'pipeline_entry', subjectId: row.subjectId },
    orderBy: { createdAt: 'desc' },
    select: { approvedVersionId: true },
  });
  const resumeRow = await tx.tailoredResume.findFirst({
    where: { entryId: row.subjectId, versionId: snapshot.versionId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!resumeRow || artifact?.approvedVersionId !== snapshot.versionId) {
    throw new ApiError('stale_share', 'Your resume was updated. Open the new version first.', {
      status: 409,
    });
  }
  const approval = await tx.approval.create({
    data: {
      agencyId: actor.agencyId,
      subject: 'tailored_resume',
      subjectId: row.subjectId,
      versionId: snapshot.versionId,
      decision,
      comments: input.comments ?? null,
      source: 'portal',
      method: null,
      approverName: await whoIs(tx, actor),
      portalUserId: actor.portalUserId,
      decidedAt: now,
    },
  });
  await tx.tailoredResume.update({
    where: { id: resumeRow.id },
    data: { approvalId: approval.id },
  });
  const entry = await tx.pipelineEntry.findUniqueOrThrow({
    where: { id: row.subjectId },
    select: { ownerId: true, candidateId: true },
  });
  await notify(tx, {
    agencyId: actor.agencyId,
    ownerId: entry.ownerId,
    kind: 'approval_received',
    entityType: 'pipeline_entry',
    entityId: row.subjectId,
    now,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: 'resume.candidate_decision_recorded',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { decision, via: 'portal', versionId: snapshot.versionId },
  });
  return { id: approval.id };
}

const PROPOSAL: Record<
  string,
  Record<string, 'interviewing' | 'on_hold' | 'client_rejected' | 'rejected'>
> = {
  interview: { submitted: 'interviewing', on_hold: 'interviewing' },
  hold: { interviewing: 'on_hold' },
  reject: { submitted: 'client_rejected', interviewing: 'rejected' },
};

/**
 * The hiring manager's decision on a submitted candidate (US-1405, FR-HMP-05): interview, hold or
 * reject with a reason. It is stored as a PROPOSAL; the pipeline does not move until the recruiter
 * confirms it, always.
 */
export async function proposeDecision(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
  input: HmDecisionInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  audience(actor, 'hiring_manager');
  const { row, snapshot } = await myShare(tx, actor, shareId, 'submission');
  if (snapshot.kind !== 'submission') throw notFound('Share');
  const entry = await tx.pipelineEntry.findUniqueOrThrow({
    where: { id: row.subjectId },
    select: { state: true, ownerId: true, candidateId: true },
  });
  const toState = PROPOSAL[input.decision]?.[entry.state];
  if (!toState) {
    throw new ApiError('conflict', 'That decision does not apply at this stage of the candidate', {
      status: 409,
    });
  }
  const open = await tx.proposedTransition.findFirst({
    where: { entryId: row.subjectId, resolvedAt: null },
    select: { id: true },
  });
  if (open)
    throw new ApiError('conflict', 'A decision is already waiting for the recruiter', {
      status: 409,
    });
  const proposal = await tx.proposedTransition.create({
    data: {
      agencyId: actor.agencyId,
      entryId: row.subjectId,
      toState,
      proposedBy: actor.portalUserId,
      reason: input.reason ?? null,
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
    action: 'portal.decision_proposed',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { decision: input.decision, toState },
  });
  return { id: proposal.id };
}

/** Structured feedback from the hiring manager on the newest interview round (US-1405, FR-IVW-03). */
export async function giveFeedback(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
  input: HmFeedbackInput,
): Promise<{ id: string }> {
  audience(actor, 'hiring_manager');
  const { row } = await myShare(tx, actor, shareId, 'submission');
  const interview = await tx.interview.findFirst({
    where: { entryId: row.subjectId, status: { not: 'cancelled' } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  if (!interview)
    throw new ApiError('conflict', 'There is no interview round to give feedback on yet', {
      status: 409,
    });
  const feedback = await tx.interviewFeedback.create({
    data: {
      agencyId: actor.agencyId,
      interviewId: interview.id,
      fromRole: 'hm',
      source: 'portal',
      comments: input.comments ?? null,
      ...Object.fromEntries(FEEDBACK_CRITERIA.map((k) => [k, input.ratings[k] ?? null])),
    },
  });
  const entry = await tx.pipelineEntry.findUniqueOrThrow({
    where: { id: row.subjectId },
    select: { candidateId: true },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: 'interview.feedback_recorded',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { interviewId: interview.id, fromRole: 'hm', via: 'portal' },
  });
  return { id: feedback.id };
}

/** The clients this candidate has been put forward to, for the consent screen (their own data only). */
export async function consentOverview(tx: ScopedTx, actor: PortalActor) {
  audience(actor, 'candidate');
  const user = await tx.portalUser.findUniqueOrThrow({
    where: { id: actor.portalUserId },
    select: { candidateId: true },
  });
  if (!user.candidateId) throw notFound('Candidate');
  const entries = await tx.pipelineEntry.findMany({
    where: { candidateId: user.candidateId },
    select: { position: { select: { clientId: true, client: { select: { name: true } } } } },
  });
  const clients = new Map(entries.map((e) => [e.position.clientId, e.position.client.name]));
  const rows = await tx.consent.findMany({
    where: { candidateId: user.candidateId },
    orderBy: [{ at: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
  return [...clients].map(([clientId, name]) => ({
    clientId,
    clientName: name,
    current: rows.find((r) => r.clientId === clientId)?.action ?? null,
    since: rows.find((r) => r.clientId === clientId)?.at ?? null,
  }));
}

/** The candidate gives or withdraws consent for one client they were put forward to (FR-CDP-03, append-only). */
export async function setConsent(
  tx: ScopedTx,
  actor: PortalActor,
  input: PortalConsentInput,
  now: Date = new Date(),
): Promise<void> {
  audience(actor, 'candidate');
  const overview = await consentOverview(tx, actor);
  if (!overview.some((c) => c.clientId === input.clientId)) throw notFound('Client');
  const user = await tx.portalUser.findUniqueOrThrow({
    where: { id: actor.portalUserId },
    select: { candidateId: true },
  });
  await tx.consent.create({
    data: {
      agencyId: actor.agencyId,
      candidateId: user.candidateId!,
      clientId: input.clientId,
      action: input.action,
      at: now,
      source: 'portal',
      method: 'portal',
    },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: `consent.${input.action}`,
    entityType: 'candidate',
    entityId: user.candidateId!,
    data: { clientId: input.clientId, via: 'portal' },
  });
}

/** The candidate asks for their data or its deletion (US-1507, FR-CDP-06); the agency's admins carry it out before the deadline. */
export async function requestPrivacy(
  tx: ScopedTx,
  actor: PortalActor,
  input: PortalPrivacyInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  audience(actor, 'candidate');
  const user = await tx.portalUser.findUniqueOrThrow({
    where: { id: actor.portalUserId },
    select: { candidateId: true },
  });
  const candidateId = user.candidateId;
  if (!candidateId) throw notFound('Candidate');
  const open = await tx.privacyRequest.findFirst({
    where: { candidateId, kind: input.kind, status: { in: ['requested', 'in_progress'] } },
    select: { id: true },
  });
  if (open)
    throw new ApiError('conflict', 'You already have an open request of this kind', {
      status: 409,
    });
  const deadlineAt = new Date(now.getTime() + PRIVACY_DEADLINE_DAYS * DAY);
  const row = await tx.privacyRequest.create({
    data: {
      agencyId: actor.agencyId,
      candidateId,
      kind: input.kind,
      source: 'candidate_portal',
      note: input.note ?? null,
      requestedAt: now,
      deadlineAt,
    },
  });
  // The reminder goes to every active admin, so the request cannot sit unseen.
  const admins = await tx.membership.findMany({
    where: { role: 'admin', active: true },
    select: { userId: true },
  });
  const dueAt = new Date(
    Math.max(now.getTime(), deadlineAt.getTime() - PRIVACY_REMINDER_DAYS * DAY),
  );
  for (const a of admins) {
    await tx.task.create({
      data: {
        agencyId: actor.agencyId,
        ownerId: a.userId,
        kind: 'privacy_request',
        entityType: 'privacy_request',
        entityId: row.id,
        dueAt,
      },
    });
  }
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'portal_user', id: actor.portalUserId },
    action: `privacy.${input.kind}_requested`,
    entityType: 'candidate',
    entityId: candidateId,
    data: { requestId: row.id, via: 'portal' },
  });
  return { id: row.id };
}

/** Approve or ask for changes on whatever the share is: the JD for a hiring manager, the resume for a candidate. */
export async function decideShare(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
  decision: 'approved' | 'changes_requested',
  input: PortalDecisionInput,
  now: Date = new Date(),
): Promise<{ id: string }> {
  const share = await tx.portalShare.findFirst({
    where: { id: shareId, portalUserId: actor.portalUserId, revokedAt: null },
    select: { kind: true },
  });
  if (!share) throw notFound('Share');
  if (share.kind === 'jd_for_approval') return decideJd(tx, actor, shareId, decision, input, now);
  if (share.kind === 'tailored_resume')
    return decideResume(tx, actor, shareId, decision, input, now);
  throw new ApiError('conflict', 'There is nothing to approve here', { status: 409 });
}
