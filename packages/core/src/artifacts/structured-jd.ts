// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** The 13 sections of a structured JD, in the order of the brief (section 3.2). */
export const JD_SECTIONS = [
  'position_summary',
  'key_responsibilities',
  'required_qualifications',
  'preferred_qualifications',
  'core_competencies',
  'technical_skills',
  'industry_experience',
  'leadership_management',
  'years_of_experience',
  'education_certification',
  'location',
  'compensation',
  'work_authorization',
] as const;
export type JdSection = (typeof JD_SECTIONS)[number];

/** Priority of one requirement (FR-INT-05): exactly one per requirement. */
export const REQUIREMENT_CATEGORIES = [
  'must_have',
  'preferred',
  'nice_to_have',
  'disqualifying',
] as const;
export type RequirementCategoryValue = (typeof REQUIREMENT_CATEGORIES)[number];

/** `found`: the JD says something about this section. `missing`: it does not; shown as "Missing, ask the hiring manager". */
export const jdSectionSchema = z.object({
  status: z.enum(['found', 'missing']),
  /** What the JD says, in the JD's own language. Empty when missing. */
  summary: z.string().max(4000),
});

const sectionsShape = Object.fromEntries(JD_SECTIONS.map((s) => [s, jdSectionSchema])) as Record<
  JdSection,
  typeof jdSectionSchema
>;

/** What the model returns for A1: no ids yet. */
export const structuredJdModelOutputSchema = z.object({
  sections: z.object(sectionsShape),
  requirements: z
    .array(
      z.object({
        section: z.enum(JD_SECTIONS),
        text: z.string().trim().min(1).max(500),
        category: z.enum(REQUIREMENT_CATEGORIES),
        /** A short quote from the JD this requirement comes from. */
        quote: z.string().max(400),
      }),
    )
    .max(80),
});
export type StructuredJdModelOutput = z.infer<typeof structuredJdModelOutputSchema>;

/** The artifact content of a structured JD: the model output plus stable requirement ids, which the editor keeps. */
export const structuredJdContentSchema = z.object({
  sections: z.object(sectionsShape),
  requirements: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        section: z.enum(JD_SECTIONS),
        text: z.string().trim().min(1).max(500),
        category: z.enum(REQUIREMENT_CATEGORIES),
        quote: z.string().max(400).default(''),
      }),
    )
    .max(120),
});
export type StructuredJdContent = z.infer<typeof structuredJdContentSchema>;

/** Sections the JD said nothing about: the follow-up list for the hiring manager. */
export function missingSections(content: Pick<StructuredJdContent, 'sections'>): JdSection[] {
  return JD_SECTIONS.filter((s) => content.sections[s].status === 'missing');
}
