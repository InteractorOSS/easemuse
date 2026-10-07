// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

const csv = z
  .string()
  .trim()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1).max(60)).max(20));

/** `GET /candidates` (pool search, US-207): free text plus filters, newest or best match first. */
export const candidateSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** Comma-separated; a candidate must have all of them. */
  skills: csv.optional(),
  location: z.string().trim().max(120).optional(),
  seniority: z.string().trim().max(40).optional(),
  /** Comma-separated; a candidate must have all of them. */
  tags: csv.optional(),
  minYears: z.coerce.number().int().min(0).max(60).optional(),
  maxYears: z.coerce.number().int().min(0).max(60).optional(),
});
export type CandidateSearchQuery = z.infer<typeof candidateSearchQuerySchema>;

/** The words of a search box as a prefix query: "hr dir" finds "HR Director". Null when there is nothing to search for. */
export function toPrefixTsQuery(text: string | undefined): string | null {
  const tokens = (text ?? '')
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
    .slice(0, 10);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(' & ') : null;
}
