// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/**
 * Evidence for claims an AI output makes about a candidate (FR-AI-05): each claim cites where in the
 * source it comes from, or is labelled as an inference ("Potential motivation", "Potential
 * concerns"). Shared by the model's structured output, the editor and the fact check.
 */
export const EVIDENCE_SOURCES = ['resume', 'profile', 'notes', 'jd', 'intake', 'feedback'] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export const quoteEvidenceSchema = z.object({
  type: z.literal('quote'),
  source: z.enum(EVIDENCE_SOURCES),
  /** Words copied from the source, so a reader (and a check) can find them. */
  excerpt: z.string().trim().min(1).max(500),
  /** Optional pointer such as "Experience, Acme Corp" or "page 2". */
  location: z.string().trim().max(120).optional(),
});

export const inferredEvidenceSchema = z.object({
  type: z.literal('inferred'),
  rationale: z.string().trim().max(300).optional(),
});

export const evidenceSchema = z.discriminatedUnion('type', [
  quoteEvidenceSchema,
  inferredEvidenceSchema,
]);
export type Evidence = z.infer<typeof evidenceSchema>;
export type QuoteEvidence = z.infer<typeof quoteEvidenceSchema>;

/** A statement plus its support; at least one evidence entry is required (cite it, or say it is inferred). */
export const claimSchema = z.object({
  text: z.string().trim().min(1),
  evidence: z.array(evidenceSchema).min(1),
});
export type Claim = z.infer<typeof claimSchema>;

/** True when nothing cites the source: the claim stands only on inference. */
export function isInferred(claim: Pick<Claim, 'evidence'>): boolean {
  return claim.evidence.every((e) => e.type === 'inferred');
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .replace(/[“”"']/g, '"')
    .trim();

/**
 * Quotes that do NOT appear in the source text they cite: a model that invents a citation is
 * caught here instead of reaching a recruiter. Whitespace and quote style are ignored.
 */
export function findUngroundedQuotes(
  claim: Pick<Claim, 'evidence'>,
  sources: Partial<Record<EvidenceSource, string>>,
): QuoteEvidence[] {
  return claim.evidence.filter((e): e is QuoteEvidence => {
    if (e.type !== 'quote') return false;
    const text = sources[e.source];
    return text === undefined || !normalise(text).includes(normalise(e.excerpt));
  });
}
