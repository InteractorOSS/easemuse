// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  FEEDBACK_CRITERIA,
  candidateFieldsFromProfile,
  interviewFeedbackContentSchema,
  unconfirmedFeedbackCriteria,
  qualificationContentSchema,
  tailoredResumeContentSchema,
  unconfirmedTopics,
  candidateProfileContentSchema,
  candidateSearchParts,
  employerKeys,
  phoneKey,
  structuredJdContentSchema,
  type ArtifactKind,
  type SubjectType,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { isEmbeddedKind, scheduleEmbeddingAfterApproval } from '@/server/embeddings/trigger';

export interface ApprovalContext {
  agencyId: string;
  kind: ArtifactKind;
  subject: { type: SubjectType; id: string };
  versionId: string;
}

type Hook = (tx: ScopedTx, context: ApprovalContext) => Promise<void>;

/**
 * Work that follows an approval, in the same transaction. Built in: approving a new success
 * profile or candidate profile marks the match analyses that used the old one as stale (FR-MAT-07),
 * so a recruiter never relies on a score computed from content that has since changed.
 */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BUILT_IN: Partial<Record<ArtifactKind, Hook>> = {
  // Approving a structured JD makes its requirements the position's requirement rows (FR-INT-05):
  // the list replaces the previous one, in the recruiter's order, one category each.
  structured_jd: async (tx, { agencyId, subject, versionId }) => {
    const version = await tx.artifactVersion.findUnique({
      where: { id: versionId },
      select: { content: true },
    });
    const content = structuredJdContentSchema.parse(version?.content);
    await tx.requirement.deleteMany({ where: { positionId: subject.id } });
    await tx.requirement.createMany({
      data: content.requirements.map((r, index) => ({
        ...(GUID.test(r.id) ? { id: r.id } : {}),
        agencyId,
        positionId: subject.id,
        section: r.section,
        text: r.text,
        category: r.category,
        sortOrder: index,
      })),
    });
  },
  success_profile: async (tx, { subject, versionId }) => {
    // Confirming the profile makes it the position's reference for matching (FR-INT-11).
    const version = await tx.artifactVersion.findUnique({
      where: { id: versionId },
      select: { artifactId: true },
    });
    if (version) {
      await tx.position.updateMany({
        where: { id: subject.id },
        data: { successProfileArtifactId: version.artifactId },
      });
    }
    await tx.matchAnalysis.updateMany({
      where: { entry: { positionId: subject.id }, stale: false },
      data: { stale: true },
    });
  },
  qualification: async (tx, { agencyId, subject, versionId }) => {
    // Approving the record means the recruiter checked every filled field against the call (FR-QUA-03).
    const version = await tx.artifactVersion.findUnique({
      where: { id: versionId },
      select: { artifactId: true, content: true },
    });
    const content = qualificationContentSchema.parse(version?.content);
    const open = unconfirmedTopics(content);
    if (open.length > 0) {
      throw new ApiError('fields_unconfirmed', 'Confirm each filled field first', {
        status: 409,
        fields: Object.fromEntries(open.map((k) => [k, 'Confirm this field'])),
      });
    }
    await tx.qualificationRecord.upsert({
      where: { entryId: subject.id },
      create: { agencyId, entryId: subject.id, artifactId: version!.artifactId },
      update: { artifactId: version!.artifactId },
    });
  },
  interview_feedback: async (tx, { agencyId, subject, versionId }) => {
    // Approving the draft is the recruiter's confirmation of each rating (FR-IVW-04); it records the
    // feedback of the round, once per version.
    const version = await tx.artifactVersion.findUnique({
      where: { id: versionId },
      select: { content: true },
    });
    const content = interviewFeedbackContentSchema.parse(version?.content);
    const open = unconfirmedFeedbackCriteria(content);
    if (open.length > 0) {
      throw new ApiError('fields_unconfirmed', 'Confirm each rating first', {
        status: 409,
        fields: Object.fromEntries(open.map((k) => [k, 'Confirm this rating'])),
      });
    }
    const rated = FEEDBACK_CRITERIA.some((k) => content.ratings[k].rating !== null);
    if (!rated && content.comments.trim() === '') {
      throw new ApiError('invalid_input', 'Give at least one rating or a comment', {
        status: 422,
        fields: { comments: 'Give at least one rating or a comment' },
      });
    }
    if (!(await tx.interview.findUnique({ where: { id: subject.id }, select: { id: true } })))
      return;
    if (await tx.interviewFeedback.findUnique({ where: { artifactVersionId: versionId } })) return;
    await tx.interviewFeedback.create({
      data: {
        agencyId,
        interviewId: subject.id,
        fromRole: content.fromRole,
        source: 'recorded_by_recruiter',
        comments: content.comments.trim() || null,
        artifactVersionId: versionId,
        ...Object.fromEntries(FEEDBACK_CRITERIA.map((k) => [k, content.ratings[k].rating])),
      },
    });
  },
  submission_report: async (tx, { agencyId, subject, versionId }) => {
    // Each approved report version gets its own row; a submission pins one of them (US-802).
    const version = await tx.artifactVersion.findUnique({
      where: { id: versionId },
      select: { artifactId: true },
    });
    if (!(await tx.pipelineEntry.findUnique({ where: { id: subject.id }, select: { id: true } })))
      return;
    await tx.submissionReport.create({
      data: { agencyId, entryId: subject.id, artifactId: version!.artifactId, versionId },
    });
  },
  tailored_resume: async (tx, { agencyId, subject, versionId }) => {
    // Each approved version gets its own row, so a candidate's approval of earlier text never
    // covers this one (FR-RES-03): the approval is recorded against the row later.
    const version = await tx.artifactVersion.findUnique({
      where: { id: versionId },
      select: { artifactId: true, content: true },
    });
    const content = tailoredResumeContentSchema.parse(version?.content);
    // An artifact whose entry is gone (an orphan, see orphans.ts) has nothing to record against.
    if (!(await tx.pipelineEntry.findUnique({ where: { id: subject.id }, select: { id: true } })))
      return;
    await tx.tailoredResume.create({
      data: {
        agencyId,
        entryId: subject.id,
        artifactId: version!.artifactId,
        versionId,
        blind: content.blind,
      },
    });
  },
  candidate_profile: async (tx, { subject, versionId }) => {
    // The approved profile feeds the candidate's list, filter and duplicate-check fields (T-2-08).
    const version = await tx.artifactVersion.findUnique({
      where: { id: versionId },
      select: { artifactId: true, content: true },
    });
    const profile = candidateProfileContentSchema.safeParse(version?.content);
    if (version && profile.success) {
      const fields = candidateFieldsFromProfile(profile.data);
      await tx.candidate.updateMany({
        where: { id: subject.id },
        data: {
          ...(fields.fullName ? { fullName: fields.fullName } : {}),
          email: fields.email,
          phone: fields.phone,
          phoneKey: phoneKey(fields.phone),
          employerKeys: employerKeys(fields.employers),
          currentTitle: fields.currentTitle,
          location: fields.location,
          skills: fields.skills,
          yearsExperience: fields.yearsExperience,
          seniority: fields.seniority,
          profileArtifactId: version.artifactId,
        },
      });
      const parts = candidateSearchParts(profile.data, fields);
      await tx.$executeRaw`
        UPDATE "Candidate" SET "searchText" =
          setweight(to_tsvector('simple', ${parts.primary}), 'A') ||
          setweight(to_tsvector('simple', ${parts.secondary}), 'B') ||
          setweight(to_tsvector('simple', ${parts.rest}), 'C')
        WHERE id = ${subject.id}::uuid`;
    }
    await tx.matchAnalysis.updateMany({
      where: { entry: { candidateId: subject.id }, stale: false },
      data: { stale: true },
    });
  },
};

const extra = new Map<ArtifactKind, Hook[]>();

/** Modules add their own follow-ups here (for example `embedding.index` after a profile is approved). */
export function registerApprovalHook(kind: ArtifactKind, hook: Hook): void {
  extra.set(kind, [...(extra.get(kind) ?? []), hook]);
}

export async function runApprovalHooks(tx: ScopedTx, context: ApprovalContext): Promise<void> {
  await BUILT_IN[context.kind]?.(tx, context);
  for (const hook of extra.get(context.kind) ?? []) await hook(tx, context);
  // Indexing for pool search (ADR-008). The job retries until this transaction has committed.
  if (isEmbeddedKind(context.kind)) {
    await scheduleEmbeddingAfterApproval(context.agencyId, {
      kind: context.kind,
      subjectId: context.subject.id,
      versionId: context.versionId,
    });
  }
}
