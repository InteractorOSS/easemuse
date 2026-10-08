// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { JD_SECTIONS, REQUIREMENT_CATEGORIES } from '../artifacts/structured-jd';
import { REPORT_SECTIONS } from '../artifacts/submission-report';
import { tailoredResumeContentSchema } from '../artifacts/tailored-resume';

/**
 * What a portal user can see (ADR-003). Each snapshot is a whitelist: `.strict()` objects, so a field
 * added to a recruiter-side record never reaches a portal unless it is added here on purpose. There
 * is no match score, no sourcing information, no recruiter note and no unapproved draft in any of them.
 */
const file = z.object({ fileId: z.guid(), filename: z.string().max(200) }).strict();
const day = z.string().max(40);

export const jdForApprovalSnapshotSchema = z
  .object({
    kind: z.literal('jd_for_approval'),
    positionTitle: z.string().max(200),
    clientName: z.string().max(200),
    versionId: z.guid(),
    sections: z
      .array(
        z
          .object({
            key: z.enum(JD_SECTIONS),
            status: z.enum(['found', 'missing']),
            summary: z.string().max(4000),
          })
          .strict(),
      )
      .max(20),
    requirements: z
      .array(
        z.object({ text: z.string().max(600), category: z.enum(REQUIREMENT_CATEGORIES) }).strict(),
      )
      .max(120),
    publishedAt: day,
  })
  .strict();

export const submissionSnapshotSchema = z
  .object({
    kind: z.literal('submission'),
    candidateName: z.string().max(200),
    positionTitle: z.string().max(200),
    clientName: z.string().max(200),
    /** Sections 1 to 14 of the approved report, by key; section 14 is `recruiterAssessment`. */
    report: z.record(z.enum([...REPORT_SECTIONS, 'recruiterAssessment']), z.string().max(6000)),
    reportFile: file,
    resumeFile: file,
    reportVersionId: z.guid(),
    resumeVersionId: z.guid(),
    submittedAt: day,
    publishedAt: day,
  })
  .strict();

export const resumeForApprovalSnapshotSchema = z
  .object({
    kind: z.literal('tailored_resume'),
    positionTitle: z.string().max(200),
    clientName: z.string().max(200),
    versionId: z.guid(),
    resume: tailoredResumeContentSchema,
    publishedAt: day,
  })
  .strict();

/**
 * How far the agency lets a candidate see into their own applications (T-15-01, FR-CDP-05). `off`
 * shares nothing; `basic` shows the position and a coarse step; `detailed` adds the client's name,
 * the number of interviews and the date of the last change. No level ever shows client feedback,
 * rejection reasons, scores or what other candidates did.
 */
export const CANDIDATE_STATUS_LEVELS = ['off', 'basic', 'detailed'] as const;
export type CandidateStatusLevel = (typeof CANDIDATE_STATUS_LEVELS)[number];

export const CANDIDATE_STATUS_STEPS = [
  'submitted',
  'interviewing',
  'on_hold',
  'offer',
  'accepted',
  'started',
  'closed',
] as const;
export type CandidateStatusStep = (typeof CANDIDATE_STATUS_STEPS)[number];

export const statusSnapshotSchema = z
  .object({
    kind: z.literal('status'),
    level: z.enum(['basic', 'detailed']),
    applications: z
      .array(
        z
          .object({
            positionTitle: z.string().max(200),
            /** Detailed level only. */
            clientName: z.string().max(200).nullable(),
            step: z.enum(CANDIDATE_STATUS_STEPS),
            /** Date (YYYY-MM-DD) of the last change; detailed level only. */
            since: z.string().max(20).nullable(),
            /** Interviews held or planned; detailed level only. */
            interviews: z.number().int().min(0).nullable(),
          })
          .strict(),
      )
      .max(50),
    publishedAt: day,
  })
  .strict();

export const portalSnapshotSchema = z.discriminatedUnion('kind', [
  jdForApprovalSnapshotSchema,
  submissionSnapshotSchema,
  resumeForApprovalSnapshotSchema,
  statusSnapshotSchema,
]);
export type PortalSnapshot = z.infer<typeof portalSnapshotSchema>;
export type JdForApprovalSnapshot = z.infer<typeof jdForApprovalSnapshotSchema>;
export type SubmissionSnapshot = z.infer<typeof submissionSnapshotSchema>;
export type ResumeForApprovalSnapshot = z.infer<typeof resumeForApprovalSnapshotSchema>;
export type StatusSnapshot = z.infer<typeof statusSnapshotSchema>;

export const PORTAL_SHARE_KINDS = [
  'jd_for_approval',
  'submission',
  'tailored_resume',
  'status',
] as const;
export type PortalShareKind = (typeof PORTAL_SHARE_KINDS)[number];

/** Which audience each kind is for. */
export const SHARE_AUDIENCE: Record<PortalShareKind, 'hiring_manager' | 'candidate'> = {
  jd_for_approval: 'hiring_manager',
  submission: 'hiring_manager',
  tailored_resume: 'candidate',
  status: 'candidate',
};

/** `POST /portal-shares`: the recruiter shares one thing with one portal user. */
export const publishShareInputSchema = z.object({
  kind: z.enum(PORTAL_SHARE_KINDS),
  portalUserId: z.guid(),
  /** The position (jd_for_approval), the pipeline entry (submission, tailored_resume) or the candidate (status). */
  subjectId: z.guid(),
});
export type PublishShareInput = z.infer<typeof publishShareInputSchema>;
