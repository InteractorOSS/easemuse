// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/**
 * Fact-check results stored on an `ArtifactVersion` (ADR-006, FR-AI-06). Each warning must be
 * resolved before a generated document (tailored resume, submission report) can be approved:
 * either the text was edited so the claim is gone, or the recruiter confirms it with a reason.
 */
export const factCheckResolutionSchema = z.object({
  kind: z.enum(['edited', 'confirmed']),
  /** Required for `confirmed`: why the unsupported claim is nevertheless correct. */
  reason: z.string().trim().max(1000).optional(),
  resolvedById: z.string(),
  resolvedAt: z.string(),
});
export type FactCheckResolution = z.infer<typeof factCheckResolutionSchema>;

export const factCheckWarningSchema = z.object({
  id: z.string().min(1),
  /** The claim in the draft that the source does not support. */
  claim: z.string().min(1),
  /** Which step found it: deterministic extraction or the LLM verifier. */
  step: z.enum(['deterministic', 'verifier']),
  resolution: factCheckResolutionSchema.optional(),
});
export type FactCheckWarning = z.infer<typeof factCheckWarningSchema>;

export const factCheckSchema = z.object({
  ranAt: z.string(),
  warnings: z.array(factCheckWarningSchema),
});
export type FactCheck = z.infer<typeof factCheckSchema>;

/** What the recruiter submits at approval: warning id to how they resolved it. */
export const factCheckResolutionsInputSchema = z.record(
  z.string(),
  z.object({
    kind: z.enum(['edited', 'confirmed']),
    reason: z.string().trim().max(1000).optional(),
  }),
);
export type FactCheckResolutionsInput = z.infer<typeof factCheckResolutionsInputSchema>;

export function unresolvedWarnings(factCheck: FactCheck): FactCheckWarning[] {
  return factCheck.warnings.filter((w) => !w.resolution);
}

export type ResolveResult =
  | { ok: true; factCheck: FactCheck }
  | { ok: false; reason: 'unknown_warning' | 'reason_required'; warningId: string };

/** Applies the recruiter's resolutions to the stored warnings (pure; does not mutate its input). */
export function applyResolutions(
  factCheck: FactCheck,
  resolutions: FactCheckResolutionsInput,
  actorId: string,
  now: Date,
): ResolveResult {
  const known = new Set(factCheck.warnings.map((w) => w.id));
  for (const id of Object.keys(resolutions)) {
    if (!known.has(id)) return { ok: false, reason: 'unknown_warning', warningId: id };
  }
  const warnings = factCheck.warnings.map((warning) => {
    const incoming = resolutions[warning.id];
    if (!incoming || warning.resolution) return warning;
    return {
      ...warning,
      resolution: { ...incoming, resolvedById: actorId, resolvedAt: now.toISOString() },
    };
  });
  for (const warning of warnings) {
    const r = warning.resolution;
    if (r?.kind === 'confirmed' && !r.reason?.trim()) {
      return { ok: false, reason: 'reason_required', warningId: warning.id };
    }
  }
  return { ok: true, factCheck: { ...factCheck, warnings } };
}
