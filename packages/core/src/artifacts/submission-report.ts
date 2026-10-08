// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { QUALIFICATION_TOPICS } from './call-questions';
import { isFilled, QUALIFICATION_LEVELS, type QualificationContent } from './qualification';

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

/**
 * One line of the code-rendered qualification summary (brief 8 to 10): what the recruiter confirmed
 * on the call, copied as is. The model never writes it.
 */
export const qualificationSummaryItemSchema = z.object({
  topic: z.enum(QUALIFICATION_TOPICS),
  value: z.string().max(400),
  level: z.enum(QUALIFICATION_LEVELS).nullable(),
});
export type QualificationSummaryItem = z.infer<typeof qualificationSummaryItemSchema>;

/** The filled topics of the approved qualification, in the fixed topic order. */
export function buildQualificationSummary(
  fields: QualificationContent['fields'] | null,
): QualificationSummaryItem[] {
  if (!fields) return [];
  return QUALIFICATION_TOPICS.filter((k) => isFilled(fields[k])).map((k) => ({
    topic: k,
    value: fields[k].value,
    level: fields[k].level,
  }));
}

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
  /** Confirmed qualification topics, filled by code. Absent in older versions. */
  qualificationSummary: z.array(qualificationSummaryItemSchema).max(20).default([]),
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
