// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { readApproved } from '@/server/artifacts/service';
import { isJdApproved } from '@/server/positions/jd-approval';
import type { PipelineGuard } from './guard-types';

/**
 * The guards of the brief's design principles (T-3-02, handoff section 3): what must be on record
 * before a recruiter moves a candidate on. Each is block or warn per agency (FR-TEN-03); with warn
 * the recruiter goes ahead by giving a reason, which is kept in the history.
 */

/** Working a candidate needs the hiring manager's approval of the JD (US-106), unless the position already passed that gate. */
export const jdApprovalGuard: PipelineGuard = async ({ tx, entry, to }) => {
  if (to !== 'contacting') return null;
  const position = await tx.position.findUnique({
    where: { id: entry.positionId },
    select: { status: true },
  });
  if (!position || !['draft', 'intake'].includes(position.status)) return null;
  if (await isJdApproved(tx, entry.positionId)) return null;
  return {
    guard: 'jdApproval',
    message: 'The hiring manager has not approved the job description for this position.',
  };
};

/** Submitting needs the candidate's approval of the tailored resume (FR-RES-03, US-702). */
export const resumeApprovalGuard: PipelineGuard = async ({ tx, entry, to }) => {
  if (to !== 'submitted') return null;
  const resume = await tx.tailoredResume.findFirst({
    where: { entryId: entry.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { approvalId: true },
  });
  const approval = resume?.approvalId
    ? await tx.approval.findUnique({ where: { id: resume.approvalId }, select: { decision: true } })
    : null;
  return approval?.decision === 'approved'
    ? null
    : { guard: 'resumeApproval', message: 'The candidate has not approved the tailored resume.' };
};

/** Submitting to a client needs the candidate's consent for that client, and a withdrawal cancels it (FR-CDP-03). */
export const consentGuard: PipelineGuard = async ({ tx, entry, to }) => {
  if (to !== 'submitted') return null;
  const position = await tx.position.findUnique({
    where: { id: entry.positionId },
    select: { clientId: true },
  });
  if (!position) return null;
  // The latest decision for this client wins; a general consent (no client) does not cover a submission.
  const latest = await tx.consent.findFirst({
    where: { candidateId: entry.candidateId, clientId: position.clientId },
    orderBy: [{ at: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { action: true },
  });
  return latest?.action === 'given'
    ? null
    : {
        guard: 'consent',
        message: 'The candidate has not consented to being submitted to this client.',
      };
};

/** Submitting needs the recruiter's own written assessment (brief 10, section 14; US-801). */
export const recruiterAssessmentGuard: PipelineGuard = async ({ tx, entry, to }) => {
  if (to !== 'submitted') return null;
  const report = await readApproved(tx, {
    kind: 'submission_report',
    subject: { type: 'pipeline_entry', id: entry.id },
  });
  const assessment = report?.content.recruiterAssessment;
  return typeof assessment === 'string' && assessment.trim() !== ''
    ? null
    : {
        guard: 'recruiterAssessment',
        message: "The submission report does not have the recruiter's assessment yet.",
      };
};

export const BUILT_IN_PIPELINE_GUARDS: readonly PipelineGuard[] = [
  jdApprovalGuard,
  resumeApprovalGuard,
  consentGuard,
  recruiterAssessmentGuard,
];
