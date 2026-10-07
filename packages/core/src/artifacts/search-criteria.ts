// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

const list = (max = 30) => z.array(z.string().trim().min(1).max(120)).max(max);

/**
 * The search sheet the recruiter takes to LinkedIn and other sources (brief 4.1, FR-SRC-01). The
 * system never searches by itself: it only prepares the conditions.
 */
export const searchCriteriaSchema = z.object({
  jobTitles: list(),
  skills: list(),
  industries: list(),
  /** Companies named in the JD or intake only; the recruiter adds the rest. */
  companies: list(),
  geography: list(),
  yearsOfExperience: z.object({
    min: z.number().int().min(0).max(60).nullable(),
    max: z.number().int().min(0).max(60).nullable(),
  }),
  education: list(),
  seniority: list(),
  leadershipExperience: list(),
  /** A ready-to-paste keyword search using AND / OR and quotes. */
  keywordSearch: z.string().max(1500),
});
export type SearchCriteria = z.infer<typeof searchCriteriaSchema>;

export const SEARCH_LIST_FIELDS = [
  'jobTitles',
  'skills',
  'industries',
  'companies',
  'geography',
  'education',
  'seniority',
  'leadershipExperience',
] as const;
export type SearchListField = (typeof SEARCH_LIST_FIELDS)[number];
