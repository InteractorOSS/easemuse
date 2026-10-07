// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import type { FactCheck, FactCheckWarning } from '@easemuse/core';
import type { AiRunContext, Gateway } from '../gateway';
import type { VerifierInput, VerifierOutput } from '../prompts/factcheck';
import { checkAgainstSources, normaliseText } from './deterministic';

export interface FactCheckInput {
  /** The generated document as plain text. */
  draft: string;
  /** What the draft may be checked against: the approved profile, the original resume, notes. */
  sources: { label: string; text: string }[];
}

const verifierId = (claim: string) =>
  `ver-${createHash('sha1').update(normaliseText(claim)).digest('hex').slice(0, 10)}`;

/**
 * The full fact check (X1): step 1, the deterministic extraction (T-AI-08), then step 2, the LLM
 * verifier (T-AI-09), merged into one warning list with duplicates removed. Step 2 goes through the
 * AI gateway, so it is budgeted, logged and tied to the recruiter who asked. If it fails the error
 * propagates and no fact check is stored: the draft then cannot be approved (`factcheck_not_run`),
 * which is the safe direction.
 */
export async function runFactCheck(
  gateway: Pick<Gateway, 'run'>,
  ctx: AiRunContext,
  input: FactCheckInput,
  now: Date = new Date(),
): Promise<FactCheck> {
  const deterministic = checkAgainstSources(
    input.draft,
    input.sources.map((s) => s.text),
  );
  const { output } = await gateway.run<VerifierInput, VerifierOutput>(
    'factcheck.verify',
    {
      draft: input.draft,
      sources: input.sources,
      alreadyFlagged: deterministic.map((w) => w.claim),
    },
    ctx,
  );

  const known = deterministic.map((w) => normaliseText(w.claim));
  const seen = new Set(deterministic.map((w) => w.id));
  const verified: FactCheckWarning[] = [];
  for (const finding of output.unsupported) {
    const id = verifierId(finding.claim);
    const text = normaliseText(finding.claim);
    // Step 1 already raised it (the verifier's quote is part of the flagged sentence, or the reverse).
    const duplicate = seen.has(id) || known.some((k) => k.includes(text) || text.includes(k));
    if (duplicate) continue;
    seen.add(id);
    verified.push({
      id,
      step: 'verifier',
      claim: finding.reason ? `${finding.claim} (${finding.reason})` : finding.claim,
    });
  }
  return { ranAt: now.toISOString(), warnings: [...deterministic, ...verified] };
}
