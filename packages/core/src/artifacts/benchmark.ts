// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { JD_SECTIONS, REQUIREMENT_CATEGORIES } from './structured-jd';

/** What a benchmark looks at (brief 3.3). */
export const BENCHMARK_CATEGORIES = [
  'title',
  'responsibility',
  'skill',
  'experience',
  'industry',
  'education',
  'compensation',
  'location',
] as const;
export type BenchmarkCategory = (typeof BENCHMARK_CATEGORIES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);

/** Where a web item comes from: always a link and a date (US-108). */
export const benchmarkSourceSchema = z.object({
  url: z.url().max(2000),
  title: z.string().trim().max(300),
  /** The day EaseMuse read the page. */
  retrievedOn: isoDate,
  /** The date the page itself shows, when it shows one. */
  publishedAt: z.string().trim().max(60).nullable(),
});
export type BenchmarkSource = z.infer<typeof benchmarkSourceSchema>;

/** A finding from the agency's own past positions: computed from records, each linked back to them (Q-21). */
export const benchmarkOurItemSchema = z.object({
  id: z.string().min(1).max(20),
  category: z.enum(BENCHMARK_CATEGORIES),
  text: text(600),
  positionIds: z.array(z.guid()).min(1).max(50),
});
export type BenchmarkOurItem = z.infer<typeof benchmarkOurItemSchema>;

/** A finding from public web pages: it keeps at least one source or it is dropped. */
export const benchmarkWebItemSchema = z.object({
  id: z.string().min(1).max(20),
  category: z.enum(BENCHMARK_CATEGORIES),
  text: text(600),
  sources: z.array(benchmarkSourceSchema).min(1).max(5),
});
export type BenchmarkWebItem = z.infer<typeof benchmarkWebItemSchema>;

export const SUGGESTION_KINDS = [
  'add_requirement',
  'change_requirement',
  'update_section',
] as const;

/**
 * A suggested change to the structured JD. It names the items it rests on, and is applied only when
 * the recruiter accepts it (one by one), as a new DRAFT of the structured JD.
 */
export const benchmarkSuggestionSchema = z.object({
  id: z.string().min(1).max(20),
  kind: z.enum(SUGGESTION_KINDS),
  section: z.enum(JD_SECTIONS),
  /** The new requirement text, the changed text, or the new section summary. */
  text: text(1500),
  /** For add and change; null for update_section. */
  category: z.enum(REQUIREMENT_CATEGORIES).nullable(),
  /** The requirement this changes (change_requirement), else null. */
  requirementId: z.string().min(1).max(64).nullable(),
  rationale: text(500),
  /** Ids of the items (ours or web) the suggestion rests on. */
  basedOn: z.array(z.string().min(1).max(20)).min(1).max(8),
});
export type BenchmarkSuggestion = z.infer<typeof benchmarkSuggestionSchema>;

/** Why the web part is empty or short, shown to the recruiter. */
export const WEB_SEARCH_STATES = ['done', 'off', 'no_results'] as const;

export const benchmarkContentSchema = z.object({
  generatedOn: isoDate,
  webSearch: z.enum(WEB_SEARCH_STATES),
  webSearchesUsed: z.number().int().min(0).max(50),
  ourData: z.array(benchmarkOurItemSchema).max(60),
  web: z.array(benchmarkWebItemSchema).max(60),
  suggestions: z.array(benchmarkSuggestionSchema).max(40),
  /** Web items the model wrote that could not be tied to a cited page, and so were left out. */
  droppedWebItems: z.number().int().min(0).max(500),
});
export type BenchmarkContent = z.infer<typeof benchmarkContentSchema>;

/** What the model returns for the structuring step (A3, step 2): references, not links. */
export const benchmarkModelOutputSchema = z.object({
  web: z
    .array(
      z.object({
        ref: z.string().min(1).max(20),
        category: z.enum(BENCHMARK_CATEGORIES),
        text: text(600),
        /** Source labels such as "S1" from the numbered list the model was given. */
        sourceIds: z.array(z.string().min(1).max(20)).max(8),
      }),
    )
    .max(60),
  suggestions: z
    .array(
      z.object({
        kind: z.enum(SUGGESTION_KINDS),
        section: z.enum(JD_SECTIONS),
        text: text(1500),
        category: z.enum(REQUIREMENT_CATEGORIES).nullable(),
        requirementId: z.string().max(64).nullable(),
        rationale: text(500),
        /** Item references: "O1" for our data, "W1" for a web item. */
        basedOn: z.array(z.string().min(1).max(20)).max(8),
      }),
    )
    .max(40),
});
export type BenchmarkModelOutput = z.infer<typeof benchmarkModelOutputSchema>;

/** Domains of paid data providers. No paid source is used (Q-05); web items that rest on one are dropped. */
export const PAID_SOURCE_DOMAINS = [
  'gartner.com',
  'forrester.com',
  'mercer.com',
  'radford.aon.com',
  'lightcast.io',
  'zoominfo.com',
  'talentinsights.linkedin.com',
  'payscale.com',
  'salary.com',
] as const;

export function isPaidSource(url: string): boolean {
  const host = /^https?:\/\/([^/:?#]+)/i.exec(url)?.[1]?.toLowerCase();
  if (!host) return false;
  return PAID_SOURCE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
