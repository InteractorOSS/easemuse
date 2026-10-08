// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  INTAKE_TOPICS,
  REPORT_SECTIONS,
  SHARE_AUDIENCE,
  intakeQuestionsContentSchema,
  structuredJdContentSchema,
  submissionReportContentSchema,
  tailoredResumeContentSchema,
  portalSnapshotSchema,
  type AgencyActor,
  type PortalShareKind,
  type PortalSnapshot,
  type PublishShareInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { readApproved, readApprovedVersionById } from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';
import { requirePosition } from '@/server/positions/service';
import { getSubmissionOverview, recordSubmission } from '@/server/submission/submit';

export interface ShareView {
  id: string;
  kind: PortalShareKind;
  portalUserId: string;
  subjectId: string;
  createdAt: Date;
  revokedAt: Date | null;
}

const iso = (d: Date) => d.toISOString();

/** Shares about a position (the rest are about a candidate in a position). */
const POSITION_KINDS = new Set<string>(['jd_for_approval', 'intake_form']);

async function loadPortalUser(tx: ScopedTx, id: string, audience: 'hiring_manager' | 'candidate') {
  const user = await tx.portalUser.findUnique({
    where: { id },
    select: {
      id: true,
      audience: true,
      disabledAt: true,
      candidateId: true,
      clientContactId: true,
      clientContact: { select: { clientId: true } },
    },
  });
  if (!user) throw notFound('Portal user');
  if (user.audience !== audience) {
    throw new ApiError('conflict', 'This item is not meant for that kind of portal user', {
      status: 409,
    });
  }
  if (user.disabledAt)
    throw new ApiError('conflict', 'This portal user has been turned off', { status: 409 });
  return user;
}

/** The snapshot for a job description sent to the hiring manager for approval (US-1402). Approved content only. */
async function jdSnapshot(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  now: Date,
): Promise<PortalSnapshot> {
  await requirePosition(tx, actor, positionId, 'edit');
  const approved = await readApproved(tx, {
    kind: 'structured_jd',
    subject: { type: 'position', id: positionId },
  });
  if (!approved) {
    throw new ApiError(
      'conflict',
      'Approve the structured JD before sending it to the hiring manager',
      { status: 409 },
    );
  }
  const content = structuredJdContentSchema.parse(approved.content);
  const details = await tx.position.findUniqueOrThrow({
    where: { id: positionId },
    select: { title: true, client: { select: { name: true } } },
  });
  return portalSnapshotSchema.parse({
    kind: 'jd_for_approval',
    positionTitle: details.title,
    clientName: details.client.name,
    versionId: approved.id,
    sections: Object.entries(content.sections).map(([key, s]) => ({
      key,
      status: s.status,
      summary: s.summary,
    })),
    requirements: content.requirements.map((r) => ({ text: r.text, category: r.category })),
    publishedAt: iso(now),
  });
}

/**
 * The intake questionnaire for the hiring manager (US-1403): the ten topics, each with the
 * recruiter's APPROVED questions for it (a topic with none is still asked, with its own title).
 * Nothing the recruiter already recorded is shown.
 */
async function intakeSnapshot(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  now: Date,
): Promise<PortalSnapshot> {
  await requirePosition(tx, actor, positionId, 'edit');
  const approved = await readApproved(tx, {
    kind: 'intake_questions',
    subject: { type: 'position', id: positionId },
  });
  const questions = approved ? intakeQuestionsContentSchema.parse(approved.content).questions : [];
  const details = await tx.position.findUniqueOrThrow({
    where: { id: positionId },
    select: { title: true, client: { select: { name: true } } },
  });
  return portalSnapshotSchema.parse({
    kind: 'intake_form',
    positionTitle: details.title,
    clientName: details.client.name,
    topics: INTAKE_TOPICS.map((key) => ({
      key,
      questions: questions
        .filter((q) => q.topic === key)
        .map((q) => q.question)
        .slice(0, 8),
    })),
    publishedAt: iso(now),
  });
}

async function fileOf(tx: ScopedTx, fileId: string) {
  const f = await tx.fileObject.findUnique({
    where: { id: fileId },
    select: { id: true, filename: true },
  });
  if (!f)
    throw new ApiError('conflict', 'A document of this submission is no longer stored', {
      status: 409,
    });
  return { fileId: f.id, filename: f.filename };
}

/**
 * The submission the hiring manager sees: the 14 report sections and the two PDFs, exactly the
 * versions pinned by the recorded submission (FR-HMP-04). If nothing was recorded yet and the
 * candidate is ready, sharing records the submission by "portal" (FR-SUB-02: publishing counts as the
 * submission record).
 */
async function submissionSnapshot(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  contactId: string,
  now: Date,
): Promise<PortalSnapshot> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  let submission = await tx.submission.findFirst({
    where: { entryId },
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
  });
  if (!submission) {
    if (entry.state !== 'candidate_approved') {
      throw new ApiError('conflict', 'Record the submission before sharing it', { status: 409 });
    }
    const overview = await getSubmissionOverview(tx, actor, entryId);
    if (!overview.report || !overview.resume) {
      throw new ApiError('conflict', 'Approve the report and the tailored resume first', {
        status: 409,
      });
    }
    await recordSubmission(tx, actor, entryId, {
      reportVersionId: overview.report.versionId,
      tailoredResumeId: overview.resume.tailoredResumeId,
      toContactId: contactId,
      method: 'portal',
      submittedAt: now,
    });
    submission = await tx.submission.findFirstOrThrow({
      where: { entryId },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    });
  }
  const report = await readApprovedVersionById(tx, submission.reportVersionId);
  if (!report) {
    throw new ApiError(
      'conflict',
      'The report was changed after it was submitted; record the submission again',
      { status: 409 },
    );
  }
  const content = submissionReportContentSchema.parse(report.content);
  const [candidate, position] = await Promise.all([
    tx.candidate.findUniqueOrThrow({
      where: { id: entry.candidateId },
      select: { fullName: true },
    }),
    tx.position.findUniqueOrThrow({
      where: { id: entry.positionId },
      select: { title: true, client: { select: { name: true } } },
    }),
  ]);
  return portalSnapshotSchema.parse({
    kind: 'submission',
    candidateName: candidate.fullName,
    positionTitle: position.title,
    clientName: position.client.name,
    report: Object.fromEntries(
      [...REPORT_SECTIONS, 'recruiterAssessment' as const].map((k) => [k, content[k]]),
    ),
    reportFile: await fileOf(tx, submission.reportPdfFileId),
    resumeFile: await fileOf(tx, submission.resumeFileId),
    reportVersionId: submission.reportVersionId,
    resumeVersionId: submission.resumeVersionId,
    submittedAt: iso(submission.submittedAt),
    publishedAt: iso(now),
  });
}

/** The tailored resume the candidate is asked to approve (US-1502): the approved version only. */
async function resumeSnapshot(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  now: Date,
): Promise<PortalSnapshot> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  const approved = await readApproved(tx, {
    kind: 'tailored_resume',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  if (!approved)
    throw new ApiError(
      'conflict',
      'Approve the tailored resume before sending it to the candidate',
      { status: 409 },
    );
  const position = await tx.position.findUniqueOrThrow({
    where: { id: entry.positionId },
    select: { title: true, client: { select: { name: true } } },
  });
  return portalSnapshotSchema.parse({
    kind: 'tailored_resume',
    positionTitle: position.title,
    clientName: position.client.name,
    versionId: approved.id,
    resume: tailoredResumeContentSchema.parse(approved.content),
    publishedAt: iso(now),
  });
}

/**
 * Publishes one item to one portal user (T-14/15, ADR-003): builds the snapshot from APPROVED
 * content, validates it against the whitelist, and replaces any earlier share of the same item for
 * that person (the old one is revoked, so they see "updated on", not two copies). The portal user
 * must belong to the right client or be the candidate concerned.
 */
export async function publishShare(
  tx: ScopedTx,
  actor: AgencyActor,
  input: PublishShareInput,
  now: Date = new Date(),
): Promise<ShareView> {
  const audience = SHARE_AUDIENCE[input.kind];
  const user = await loadPortalUser(tx, input.portalUserId, audience);
  let snapshot: PortalSnapshot;

  if (input.kind === 'jd_for_approval' || input.kind === 'intake_form') {
    const position = await tx.position.findUnique({
      where: { id: input.subjectId },
      select: { clientId: true },
    });
    if (!position) throw notFound('Position');
    if (user.clientContact?.clientId !== position.clientId) {
      throw forbidden("This person is not a contact of the position's client");
    }
    snapshot =
      input.kind === 'jd_for_approval'
        ? await jdSnapshot(tx, actor, input.subjectId, now)
        : await intakeSnapshot(tx, actor, input.subjectId, now);
  } else {
    const entry = await tx.pipelineEntry.findUnique({
      where: { id: input.subjectId },
      select: { candidateId: true, position: { select: { clientId: true } } },
    });
    if (!entry) throw notFound('Candidate in position');
    if (input.kind === 'submission') {
      if (!user.clientContactId || user.clientContact?.clientId !== entry.position.clientId) {
        throw forbidden("This person is not a contact of the position's client");
      }
      snapshot = await submissionSnapshot(tx, actor, input.subjectId, user.clientContactId, now);
    } else {
      if (user.candidateId !== entry.candidateId)
        throw forbidden('This is not the candidate of that entry');
      snapshot = await resumeSnapshot(tx, actor, input.subjectId, now);
    }
  }

  await tx.portalShare.updateMany({
    where: { portalUserId: user.id, kind: input.kind, subjectId: input.subjectId, revokedAt: null },
    data: { revokedAt: now },
  });
  const row = await tx.portalShare.create({
    data: {
      agencyId: actor.agencyId,
      portalUserId: user.id,
      kind: input.kind,
      subjectId: input.subjectId,
      snapshot: snapshot as never,
      createdById: actor.userId,
    },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'portal.shared',
    entityType: POSITION_KINDS.has(input.kind) ? 'position' : 'pipeline_entry',
    entityId: input.subjectId,
    data: { kind: input.kind, shareId: row.id },
  });
  return {
    id: row.id,
    kind: input.kind,
    portalUserId: user.id,
    subjectId: input.subjectId,
    createdAt: row.createdAt,
    revokedAt: null,
  };
}

/** Stops showing an item: the portal user no longer sees it at their next request. */
export async function revokeShare(
  tx: ScopedTx,
  actor: AgencyActor,
  shareId: string,
  now: Date = new Date(),
): Promise<void> {
  const share = await tx.portalShare.findUnique({
    where: { id: shareId },
    select: { id: true, kind: true, subjectId: true, revokedAt: true },
  });
  if (!share) throw notFound('Share');
  if (share.revokedAt) return;
  await tx.portalShare.update({ where: { id: shareId }, data: { revokedAt: now } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'portal.share_revoked',
    entityType: POSITION_KINDS.has(share.kind) ? 'position' : 'pipeline_entry',
    entityId: share.subjectId,
    data: { kind: share.kind, shareId },
  });
}

/** What has been shared about one item, newest first, for the recruiter's own screens. */
export async function listSharesFor(
  tx: ScopedTx,
  kind: PortalShareKind,
  subjectId: string,
): Promise<ShareView[]> {
  const rows = await tx.portalShare.findMany({
    where: { kind, subjectId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as PortalShareKind,
    portalUserId: r.portalUserId,
    subjectId: r.subjectId,
    createdAt: r.createdAt,
    revokedAt: r.revokedAt,
  }));
}
