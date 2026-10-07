// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  JD_SECTIONS,
  structuredJdContentSchema,
  type JdSection,
  type RequirementCategoryValue,
} from '@easemuse/core';

/** Priorities that go to the hiring manager. Deal-breakers stay inside the agency. */
export const SHARED_CATEGORIES: RequirementCategoryValue[] = [
  'must_have',
  'preferred',
  'nice_to_have',
];

export interface JdDocumentModel {
  /** Sections the JD covers, in the brief's order; sections it did not cover are left out. */
  sections: { key: JdSection; heading: string; text: string }[];
  requirements: { category: RequirementCategoryValue; heading: string; items: string[] }[];
}

/**
 * What the improved JD says, shared by the PDF print page and the DOCX file so the two always match
 * (T-1-12): found sections, then requirements by priority, without the deal-breakers.
 */
export function buildJdDocumentModel(
  content: unknown,
  labels: {
    section: (key: JdSection) => string;
    category: (c: RequirementCategoryValue) => string;
  },
): JdDocumentModel {
  const jd = structuredJdContentSchema.parse(content);
  return {
    sections: JD_SECTIONS.filter((s) => jd.sections[s].status === 'found').map((key) => ({
      key,
      heading: labels.section(key),
      text: jd.sections[key].summary,
    })),
    requirements: SHARED_CATEGORIES.flatMap((category) => {
      const items = jd.requirements.filter((r) => r.category === category).map((r) => r.text);
      return items.length ? [{ category, heading: labels.category(category), items }] : [];
    }),
  };
}
