// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, RecordSubmissionInput } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { findArtifact } from '@/server/artifacts/service';
import { findRenderedDocument } from '@/server/documents/render/service';
import { requireEntry, transitionEntry } from '@/server/pipeline/service';

export interface SubmissionView {
  id: string;
  toContactName: string | null;
  method: string;
  submittedAt: Date;
  reportVersionId: string;
  resumeVersionId: string;
  reportPdfFileId: string;
  resumeFileId: string;
}

export interface SubmissionOverview {
  state: string;
  clientName: string;
  contacts: { id: string; name: string; title: string | null }[];
  /** What a submission would pin right now; null where the step is not done. */
  report: { versionId: string; pdfFileId: string | null } | null;
  resume: { tailoredResumeId: string; versionId: string; pdfFileId: string | null } | null;
  /** Earlier submissions of this candidate to this client, by anyone, for any position. */
  earlierToClient: { submittedAt: Date; positionTitle: string }[];
  submissions: SubmissionView[];
}

async function contactName(tx: ScopedTx, id: string): Promise<string | null> {
  return (
    (await tx.clientContact.findUnique({ where: { id }, select: { name: true } }))?.name ?? null
  );
}

async function pinned(tx: ScopedTx, agencyId: string, entryId: string) {
  const subject = { type: 'pipeline_entry' as const, id: entryId };
  const [reportArtifact, resumeArtifact] = await Promise.all([
    findArtifact(tx, { kind: 'submission_report', subject }),
    findArtifact(tx, { kind: 'tailored_resume', subject }),
  ]);
  const reportVersionId = reportArtifact?.approvedVersionId ?? null;
  const resumeVersionId = resumeArtifact?.approvedVersionId ?? null;
  const [reportPdf, resumePdf, resumeRow] = await Promise.all([
    reportVersionId
      ? findRenderedDocument(tx, { agencyId, kind: 'report', versionId: reportVersionId })
      : null,
    resumeVersionId
      ? findRenderedDocument(tx, { agencyId, kind: 'resume', versionId: resumeVersionId })
      : null,
    resumeVersionId
      ? tx.tailoredResume.findFirst({
          where: { entryId, versionId: resumeVersionId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
      : null,
  ]);
  return {
    report: reportVersionId
      ? { versionId: reportVersionId, pdfFileId: reportPdf?.upToDate ? reportPdf.fileId : null }
      : null,
    resume:
      resumeVersionId && resumeRow
        ? {
            tailoredResumeId: resumeRow.id,
            versionId: resumeVersionId,
            pdfFileId: resumePdf?.upToDate ? resumePdf.fileId : null,
          }
        : null,
  };
}

async function earlierSubmissions(
  tx: ScopedTx,
  candidateId: string,
  clientId: string,
  excludeEntryId?: string,
) {
  const rows = await tx.submission.findMany({
    where: {
      entry: { candidateId, position: { clientId } },
      ...(excludeEntryId ? { entryId: { not: excludeEntryId } } : {}),
    },
    orderBy: { submittedAt: 'desc' },
    select: { submittedAt: true, entry: { select: { position: { select: { title: true } } } } },
  });
  return rows.map((r) => ({ submittedAt: r.submittedAt, positionTitle: r.entry.position.title }));
}

export async function getSubmissionOverview(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<SubmissionOverview> {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  const position = await tx.position.findUniqueOrThrow({
    where: { id: entry.positionId },
    select: {
      clientId: true,
      client: {
        select: {
          name: true,
          contacts: { select: { id: true, name: true, title: true }, orderBy: { name: 'asc' } },
        },
      },
    },
  });
  const rows = await tx.submission.findMany({
    where: { entryId },
    orderBy: { submittedAt: 'desc' },
  });
  const submissions: SubmissionView[] = [];
  for (const r of rows) {
    submissions.push({
      id: r.id,
      toContactName: await contactName(tx, r.toContactId),
      method: r.method,
      submittedAt: r.submittedAt,
      reportVersionId: r.reportVersionId,
      resumeVersionId: r.resumeVersionId,
      reportPdfFileId: r.reportPdfFileId,
      resumeFileId: r.resumeFileId,
    });
  }
  return {
    state: entry.state,
    clientName: position.client.name,
    contacts: position.client.contacts,
    ...(await pinned(tx, actor.agencyId, entryId)),
    earlierToClient: await earlierSubmissions(tx, entry.candidateId, position.clientId, entryId),
    submissions,
  };
}

/**
 * Records a submission (T-8-04, FR-SUB-03, US-802): checks that the approved report and resume are
 * the ones the recruiter saw and that both have a current PDF, then moves the candidate to
 * "submitted" (the guards for the candidate's approval, consent and the recruiter's assessment run
 * there) and stores which exact versions and files were sent. The files are never regenerated in place.
 */
export async function recordSubmission(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  input: RecordSubmissionInput,
): Promise<SubmissionView> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (input.submittedAt.getTime() > Date.now() + 60_000) {
    throw new ApiError('invalid_input', 'The date cannot be in the future', {
      status: 422,
      fields: { submittedAt: 'Cannot be in the future' },
    });
  }
  const position = await tx.position.findUniqueOrThrow({
    where: { id: entry.positionId },
    select: { clientId: true },
  });
  const contact = await tx.clientContact.findFirst({
    where: { id: input.toContactId, clientId: position.clientId },
    select: { id: true },
  });
  if (!contact) {
    throw new ApiError('invalid_input', "Choose one of the client's contacts", {
      status: 422,
      fields: { toContactId: 'Not a contact of this client' },
    });
  }
  const now = await pinned(tx, actor.agencyId, entryId);
  if (!now.report || now.report.versionId !== input.reportVersionId) {
    throw new ApiError('conflict', 'The report changed or is not approved; reload and check it', {
      status: 409,
    });
  }
  if (!now.resume || now.resume.tailoredResumeId !== input.tailoredResumeId) {
    throw new ApiError(
      'conflict',
      'The tailored resume changed or is not approved; reload and check it',
      { status: 409 },
    );
  }
  if (!now.report.pdfFileId || !now.resume.pdfFileId) {
    throw new ApiError(
      'pdf_missing',
      'Create an up-to-date PDF of the report and of the resume first',
      { status: 409 },
    );
  }
  const earlier = await earlierSubmissions(tx, entry.candidateId, position.clientId);
  if (earlier.length > 0 && !input.duplicateReason) {
    throw new ApiError(
      'duplicate_submission',
      'This candidate was already submitted to this client',
      {
        status: 409,
        fields: { duplicateReason: 'Say why you are submitting again' },
      },
    );
  }

  // The guards (candidate approval, consent, assessment) are asked here; a refusal rolls everything back.
  await transitionEntry(tx, actor, entryId, {
    to: 'submitted',
    ...(input.overrideGuards ? { overrideGuards: input.overrideGuards } : {}),
  });

  const reportRow = await tx.submissionReport.findFirst({
    where: { entryId, versionId: input.reportVersionId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  if (!reportRow)
    throw new ApiError('conflict', 'The approved report has no record; approve it again', {
      status: 409,
    });
  await tx.submissionReport.update({
    where: { id: reportRow.id },
    data: { pdfFileId: now.report.pdfFileId },
  });
  await tx.tailoredResume.update({
    where: { id: now.resume.tailoredResumeId },
    data: { pdfFileId: now.resume.pdfFileId },
  });
  const row = await tx.submission.create({
    data: {
      agencyId: actor.agencyId,
      entryId,
      reportId: reportRow.id,
      reportVersionId: input.reportVersionId,
      reportPdfFileId: now.report.pdfFileId,
      tailoredResumeId: now.resume.tailoredResumeId,
      resumeVersionId: now.resume.versionId,
      resumeFileId: now.resume.pdfFileId,
      toContactId: input.toContactId,
      method: input.method,
      submittedAt: input.submittedAt,
      submittedById: actor.userId,
    },
  });
  for (const [type, id] of [
    ['candidate', entry.candidateId],
    ['position', entry.positionId],
  ] as const) {
    await logActivity(tx, {
      agencyId: actor.agencyId,
      actor: { type: 'user', id: actor.userId },
      action: 'candidate.submitted',
      entityType: type,
      entityId: id,
      data: {
        entryId,
        method: input.method,
        reportVersionId: input.reportVersionId,
        resumeVersionId: now.resume.versionId,
        ...(input.duplicateReason ? { duplicateReason: input.duplicateReason } : {}),
      },
    });
  }
  return {
    id: row.id,
    toContactName: await contactName(tx, row.toContactId),
    method: row.method,
    submittedAt: row.submittedAt,
    reportVersionId: row.reportVersionId,
    resumeVersionId: row.resumeVersionId,
    reportPdfFileId: row.reportPdfFileId,
    resumeFileId: row.resumeFileId,
  };
}
