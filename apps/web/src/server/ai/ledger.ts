// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { costUsd, embeddingCostUsd, type TokenUsage } from './pricing';

/** Start of the calendar month (UTC) that budgets and usage reports are counted in. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type BudgetLevel = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  spentUsd: number;
  limitUsd: number | null;
  /** Share of the limit used; null when there is no limit. */
  ratio: number | null;
  /** `warning` from 80% (US-1304), `over` at 100%. */
  level: BudgetLevel;
}

export function budgetLevel(spentUsd: number, limitUsd: number | null): BudgetStatus {
  if (limitUsd === null) return { spentUsd, limitUsd, ratio: null, level: 'ok' };
  const ratio = limitUsd > 0 ? spentUsd / limitUsd : 1;
  return {
    spentUsd,
    limitUsd,
    ratio,
    level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok',
  };
}

/** Month-to-date AI cost and the agency's limit (ADR-013). No limit set means unlimited. */
export async function getBudgetStatus(
  tx: ScopedTx,
  agencyId: string,
  now: Date = new Date(),
): Promise<BudgetStatus> {
  const [agency, spent] = await Promise.all([
    tx.agency.findUnique({ where: { id: agencyId }, select: { aiMonthlyBudgetUsd: true } }),
    tx.llmCall.aggregate({
      where: { agencyId, createdAt: { gte: monthStart(now) } },
      _sum: { costUsd: true },
    }),
  ]);
  const limit = agency?.aiMonthlyBudgetUsd == null ? null : Number(agency.aiMonthlyBudgetUsd);
  return budgetLevel(Number(spent._sum.costUsd ?? 0), limit);
}

/** The local budget gate: over the limit means 402, AI drafting pauses and non-AI work continues (US-1304). */
export async function assertWithinBudget(
  tx: ScopedTx,
  agencyId: string,
  now?: Date,
): Promise<BudgetStatus> {
  const status = await getBudgetStatus(tx, agencyId, now);
  if (status.level === 'over') {
    throw new ApiError(
      'budget_exceeded',
      "This month's AI budget has been used. Ask your admin to raise it.",
      { status: 402 },
    );
  }
  return status;
}

export interface LlmCallRecord {
  agencyId: string;
  aiGenerationId: string | null;
  requestedById: string | null;
  positionId: string | null;
  purpose: string;
  model: string;
  promptVersion: string;
  usage: TokenUsage;
  latencyMs: number;
}

/** One row per model call (FR-AI-08): tokens, cost from the price table, latency. Never prompt text. */
export async function recordLlmCall(
  tx: ScopedTx,
  call: LlmCallRecord,
): Promise<{ id: string; costUsd: number }> {
  const cost = costUsd(call.model, call.usage);
  const row = await tx.llmCall.create({
    data: {
      agencyId: call.agencyId,
      aiGenerationId: call.aiGenerationId,
      requestedById: call.requestedById,
      positionId: call.positionId,
      purpose: call.purpose,
      model: call.model,
      promptVersion: call.promptVersion,
      inputTokens: call.usage.inputTokens,
      outputTokens: call.usage.outputTokens,
      cachedTokens: call.usage.cachedTokens,
      costUsd: cost,
      latencyMs: call.latencyMs,
    },
    select: { id: true },
  });
  return { id: row.id, costUsd: cost };
}

export interface EmbeddingCallRecord {
  agencyId: string;
  aiGenerationId: string | null;
  /** The recruiter who asked (a pool search); null for indexing after an approval (FR-AI-01 exception). */
  requestedById: string | null;
  positionId: string | null;
  purpose: 'embedding.index' | 'embedding.query';
  model: string;
  tokens: number;
  latencyMs: number;
}

/** One ledger row per embedding call, so Voyage cost is metered like every model call (ADR-013). */
export async function recordEmbeddingCall(
  tx: ScopedTx,
  call: EmbeddingCallRecord,
): Promise<{ id: string; costUsd: number }> {
  const cost = embeddingCostUsd(call.model, call.tokens);
  const row = await tx.llmCall.create({
    data: {
      agencyId: call.agencyId,
      aiGenerationId: call.aiGenerationId,
      requestedById: call.requestedById,
      positionId: call.positionId,
      purpose: call.purpose,
      model: call.model,
      promptVersion: 'voyage-v1',
      inputTokens: call.tokens,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: cost,
      latencyMs: call.latencyMs,
    },
    select: { id: true },
  });
  return { id: row.id, costUsd: cost };
}
