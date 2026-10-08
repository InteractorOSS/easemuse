// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { MIN_SAMPLE, buildPatternReports, summaryFacts, type AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { PatternSummarizeInput } from '@/server/ai/prompts/pattern-summarize';
import { findArtifact } from '@/server/artifacts/service';
import { requirePosition } from '@/server/positions/service';
import { loadFacts } from './facts';

/**
 * A18 for a position's client (T-12-04, FR-KNW-03). It runs only when a recruiter asks. The model
 * sees counts, never records; the draft keeps the references to the records behind every sentence;
 * and it is a draft until the recruiter edits and approves it (ADR-006).
 */
export interface PatternSummaryPlan {
  input: PatternSummarizeInput;
  inputRefs: { positionId: string; clientId: string; records: number; facts: number };
}

export async function planPatternSummary(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<PatternSummaryPlan> {
  const position = await requirePosition(tx, actor, positionId, 'edit');
  const client = await tx.client.findUnique({
    where: { id: position.clientId },
    select: { id: true, name: true },
  });
  if (!client) throw notFound('Client');
  const facts = await loadFacts(tx, actor, { clientId: client.id });
  const submitted = facts.entries.filter((e) => e.submitted).length;
  if (submitted === 0) {
    throw new ApiError(
      'conflict',
      'There is nothing to summarize yet: no candidate has been put forward to this client',
      { status: 409 },
    );
  }
  const reports = buildPatternReports(facts.entries, facts.positions);
  const list = summaryFacts(reports);
  if (list.length === 0) {
    throw new ApiError('conflict', `Too few records to summarize (fewer than ${MIN_SAMPLE})`, {
      status: 409,
    });
  }
  return {
    input: {
      facts: list,
      context: {
        clientId: client.id,
        clientName: client.name,
        asOf: new Date().toISOString().slice(0, 10),
        records: reports.entries,
        positions: reports.positions,
        withheld: reports.withheld.values,
      },
    },
    inputRefs: {
      positionId,
      clientId: client.id,
      records: reports.entries,
      facts: list.length,
    },
  };
}

export type PatternSummaryRunner = (
  purpose: 'pattern.summarize',
  input: PatternSummarizeInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

/**
 * Runs A18. The model's text is deliberately NOT streamed to the screen: each sentence is checked
 * first (numbers, cited facts, protected characteristics), and a sentence that fails must never be
 * shown, even briefly.
 */
export function runPatternSummary(
  run: PatternSummaryRunner,
  actor: AgencyActor,
  positionId: string,
  plan: PatternSummaryPlan,
  stream: { signal: AbortSignal },
): Promise<AiRunResult> {
  return run('pattern.summarize', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId,
    subject: { type: 'position', id: positionId },
    inputRefs: plan.inputRefs,
    signal: stream.signal,
  });
}

export async function getPatternSummaryArtifact(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
) {
  await requirePosition(tx, actor, positionId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'pattern_summary',
    subject: { type: 'position', id: positionId },
  });
  return {
    artifactId: artifact?.id ?? null,
    approvedVersionId: artifact?.approvedVersionId ?? null,
  };
}
