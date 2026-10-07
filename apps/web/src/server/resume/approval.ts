// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type {
  AgencyActor,
  ConsentAction,
  RecordApprovalInput,
  RecordConsentInput,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { findArtifact } from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';

export interface ResumeApprovalView {
  id: string;
  decision: 'approved' | 'changes_requested';
  approverName: string;
  method: string | null;
  decidedAt: Date;
  comments: string | null;
  /** False when the resume was changed and approved again after this decision. */
  current: boolean;
}

export interface ConsentView {
  id: string;
  action: string;
  at: Date;
  method: string | null;
}

export interface ApprovalsOverview {
  clientId: string;
  clientName: string;
  candidateName: string;
  /** The approved resume version a candidate approval would cover; null until the recruiter approves one. */
  resumeVersionId: string | null;
  approvals: ResumeApprovalView[];
  /** The latest decision for this client, and the full history (newest first). */
  consent: ConsentView | null;
  consents: ConsentView[];
}

async function overviewOf(tx: ScopedTx, entryId: string): Promise<ApprovalsOverview> {
  const entry = await tx.pipelineEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      candidateId: true,
      candidate: { select: { fullName: true } },
      position: { select: { clientId: true, client: { select: { name: true } } } },
    },
  });
  const artifact = await findArtifact(tx, {
    kind: 'tailored_resume',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  const resumeVersionId = artifact?.approvedVersionId ?? null;
  const [approvals, consents] = await Promise.all([
    tx.approval.findMany({
      where: { subject: 'tailored_resume', subjectId: entryId },
      orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    }),
    tx.consent.findMany({
      where: { candidateId: entry.candidateId, clientId: entry.position.clientId },
      orderBy: [{ at: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    }),
  ]);
  const consentViews = consents.map((c) => ({
    id: c.id,
    action: c.action,
    at: c.at,
    method: c.method,
  }));
  return {
    clientId: entry.position.clientId,
    clientName: entry.position.client.name,
    candidateName: entry.candidate.fullName,
    resumeVersionId,
    approvals: approvals.map((a) => ({
      id: a.id,
      decision: a.decision,
      approverName: a.approverName,
      method: a.method,
      decidedAt: a.decidedAt,
      comments: a.comments,
      current: a.versionId === resumeVersionId,
    })),
    consent: consentViews[0] ?? null,
    consents: consentViews,
  };
}

export async function getApprovals(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<ApprovalsOverview> {
  await requireEntry(tx, actor, entryId, 'read');
  return overviewOf(tx, entryId);
}

function assertNotFuture(at: Date, field: string): void {
  if (at.getTime() > Date.now() + 60_000) {
    throw new ApiError('invalid_input', 'The date cannot be in the future', {
      status: 422,
      fields: { [field]: 'Cannot be in the future' },
    });
  }
}

/**
 * Records the candidate's decision on the approved tailored resume (T-7-04, US-702, brief 9.2): the
 * recruiter sends the resume and profile to the candidate and notes the answer here. It is bound to
 * the exact approved version, so changing the resume later means asking again. The candidate's own
 * approval is a separate step from the recruiter's approval of the draft.
 */
export async function recordResumeApproval(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: RecordApprovalInput,
): Promise<ApprovalsOverview> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  assertNotFuture(input.decidedAt, 'decidedAt');
  const row = await tx.tailoredResume.findFirst({
    where: { entryId, versionId: { not: null } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const artifact = await findArtifact(tx, {
    kind: 'tailored_resume',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  if (!row || !artifact?.approvedVersionId || row.versionId !== artifact.approvedVersionId) {
    throw new ApiError(
      'conflict',
      'Approve the tailored resume before recording the candidate decision',
      { status: 409 },
    );
  }
  const approval = await tx.approval.create({
    data: {
      agencyId: actor.agencyId,
      subject: 'tailored_resume',
      subjectId: entryId,
      versionId: row.versionId!,
      decision: input.decision,
      comments: input.comments ?? null,
      source: 'recorded_by_recruiter',
      method: input.method,
      approverName: input.approverName,
      recordedById: actor.userId,
      decidedAt: input.decidedAt,
    },
  });
  await tx.tailoredResume.update({ where: { id: row.id }, data: { approvalId: approval.id } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'resume.candidate_decision_recorded',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { entryId, decision: input.decision, method: input.method, versionId: row.versionId },
  });
  return overviewOf(tx, entryId);
}

/** Who may record consent for a candidate: a lead or admin, or someone who works the candidate. */
async function assertMayRecordConsent(tx: ScopedTx, actor: AgencyActor, candidateId: string) {
  if (actor.role === 'admin' || actor.role === 'lead') return;
  const works = await tx.pipelineEntry.findFirst({
    where: { candidateId, ownerId: actor.userId },
    select: { id: true },
  });
  const created = await tx.candidate.findFirst({
    where: { id: candidateId, createdById: actor.userId },
    select: { id: true },
  });
  if (!works && !created)
    throw forbidden('Only the recruiter working this candidate, a lead or an admin can do this');
}

/**
 * Appends a consent row (FR-CDP-03, ADR-016): given or withdrawn, per client. Rows are never edited;
 * the latest by date wins. A withdrawal blocks submission to that client.
 */
export async function recordConsent(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  input: RecordConsentInput,
): Promise<{ items: ConsentView[] }> {
  const candidate = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { status: true },
  });
  if (!candidate || candidate.status === 'discarded') throw notFound('Candidate');
  await assertMayRecordConsent(tx, actor, candidateId);
  if (!(await tx.client.findUnique({ where: { id: input.clientId }, select: { id: true } })))
    throw notFound('Client');
  assertNotFuture(input.at, 'at');
  await tx.consent.create({
    data: {
      agencyId: actor.agencyId,
      candidateId,
      clientId: input.clientId,
      action: input.action,
      at: input.at,
      source: 'recorded_by_recruiter',
      method: input.method,
      recordedById: actor.userId,
    },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: `consent.${input.action satisfies ConsentAction}`,
    entityType: 'candidate',
    entityId: candidateId,
    data: { clientId: input.clientId, method: input.method },
  });
  return listConsents(tx, candidateId, input.clientId);
}

export async function listConsents(
  tx: ScopedTx,
  candidateId: string,
  clientId?: string,
): Promise<{ items: ConsentView[] }> {
  const rows = await tx.consent.findMany({
    where: { candidateId, ...(clientId ? { clientId } : {}) },
    orderBy: [{ at: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  });
  return { items: rows.map((c) => ({ id: c.id, action: c.action, at: c.at, method: c.method })) };
}
