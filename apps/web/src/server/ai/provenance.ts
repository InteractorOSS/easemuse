// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import { listVersionsOfGeneration } from '@/server/artifacts/service';

export interface Provenance {
  id: string;
  purpose: string;
  status: string;
  error: string | null;
  requestedById: string | null;
  promptVersion: string;
  model: string;
  /** Ids and versions of every record the prompt used. Never the prompt text itself. */
  inputRefs: unknown;
  createdAt: Date;
  calls: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    latencyMs: number;
  }[];
  totalCostUsd: number;
  /** Artifact versions that came from this generation. */
  versions: { artifactId: string; versionId: string; version: number; status: string }[];
}

/** Everything recorded about one AI result (FR-AI-03, T-AI-11). Another agency's id is a 404 (RLS). */
export async function getProvenance(tx: ScopedTx, generationId: string): Promise<Provenance> {
  const generation = await tx.aiGeneration.findUnique({ where: { id: generationId } });
  if (!generation) throw notFound('AI result');
  const [calls, versions] = await Promise.all([
    tx.llmCall.findMany({ where: { aiGenerationId: generationId }, orderBy: { createdAt: 'asc' } }),
    listVersionsOfGeneration(tx, generationId),
  ]);
  const mapped = calls.map((c) => ({
    model: c.model,
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    cachedTokens: c.cachedTokens,
    costUsd: Number(c.costUsd),
    latencyMs: c.latencyMs,
  }));
  return {
    id: generation.id,
    purpose: generation.purpose,
    status: generation.status,
    error: generation.error,
    requestedById: generation.requestedById,
    promptVersion: generation.promptVersion,
    model: generation.model,
    inputRefs: generation.inputRefs,
    createdAt: generation.createdAt,
    calls: mapped,
    totalCostUsd: Math.round(mapped.reduce((sum, c) => sum + c.costUsd, 0) * 1_000_000) / 1_000_000,
    versions,
  };
}
