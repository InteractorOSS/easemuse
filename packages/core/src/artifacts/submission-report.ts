// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** Sections 1 to 13 of the Candidate Submission Report (brief 10); section 14 is the recruiter's own. */
export const REPORT_SECTIONS = [
  'overview',
  'currentPosition',
  'careerSummary',
  'keyQualifications',
  'achievements',
  'jdMatch',
  'recommendation',
  'concerns',
  'compensation',
  'location',
  'workAuthorization',
  'motivation',
  'interviewAvailability',
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

/** Sections that come from the reviewed match analysis. */
export const ANALYSIS_SECTIONS: readonly ReportSection[] = [
  'jdMatch',
  'recommendation',
  'concerns',
];
/** Sections that come from the confirmed qualification call. */
export const QUALIFICATION_SECTIONS: readonly ReportSection[] = [
  'compensation',
  'location',
  'workAuthorization',
  'motivation',
  'interviewAvailability',
];

/** What a section says when the record it depends on does not exist yet (US-801). */
export const NOT_CONFIRMED = 'Not yet confirmed';

const text = z.string().max(3000);

const sectionShapes = Object.fromEntries(REPORT_SECTIONS.map((k) => [k, text])) as Record<
  ReportSection,
  typeof text
>;

/** What the model writes: sections 1 to 13 only. The assessment is not part of its output. */
export const submissionReportModelOutputSchema = z.object(sectionShapes);
export type SubmissionReportModelOutput = z.infer<typeof submissionReportModelOutputSchema>;

/** The stored report. `recruiterAssessment` (section 14) is written by the recruiter alone and is required to approve. */
export const submissionReportContentSchema = z.object({
  ...(Object.fromEntries(REPORT_SECTIONS.map((k) => [k, text.default('')])) as Record<
    ReportSection,
    z.ZodDefault<typeof text>
  >),
  recruiterAssessment: z.string().max(6000).default(''),
  /** Which records were missing when the draft was written, so the recruiter knows why a section is open. */
  missingInputs: z.array(z.string().max(80)).max(10).default([]),
});
export type SubmissionReportContent = z.infer<typeof submissionReportContentSchema>;

/** The report as plain text: what the fact check reads. */
export function submissionReportText(c: SubmissionReportContent): string {
  return REPORT_SECTIONS.map((k) => c[k])
    .filter((t) => t.trim() !== '' && t !== NOT_CONFIRMED)
    .join('\n');
}
