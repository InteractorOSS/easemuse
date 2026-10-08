// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import {
  candidateEmbeddingText,
  candidateProfileContentSchema,
  successProfileContentSchema,
  successProfileEmbeddingText,
  type CandidateProfileContent,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { AiProviderError } from '@/server/ai/errors';
import { assertWithinBudget, recordEmbeddingCall } from '@/server/ai/ledger';
import { redactText } from '@/server/ai/redaction';
import { toVectorLiteral, type EmbeddingClient } from '@/server/ai/voyage';
import { readApprovedVersionById, versionStatuses } from '@/server/artifacts/service';
import type { JobContext } from '@/worker/registry';
import { EMBEDDED_KINDS, type EmbeddedKind } from './trigger';

const dataSchema = z.object({
  kind: z.enum(EMBEDDED_KINDS),
  subjectId: z.guid(),
  versionId: z.guid(),
});

/**
 * The text Voyage receives for an approved version: the profile without name, contact details or
 * links (FR-AI-09), with protected characteristics cut out as for every other AI input. Returns
 * null when the content is not what the kind expects.
 */
export function embeddingTextOf(
  kind: EmbeddedKind,
  content: unknown,
  position?: { title: string; location: string },
): string | null {
  if (kind === 'candidate_profile') {
    const parsed = candidateProfileContentSchema.safeParse(content);
    if (!parsed.success) return null;
    return redactText(candidateEmbeddingText(parsed.data as CandidateProfileContent)).value;
  }
  const parsed = successProfileContentSchema.safeParse(content);
  if (!parsed.success) return null;
  return redactText(successProfileEmbeddingText(parsed.data, position)).value;
}

export type IndexOutcome = 'indexed' | 'skipped_stale' | 'skipped_empty' | 'skipped_subject';

/** The reason a job should be tried again later rather than given up: the approval may not be visible yet. */
export class NotVisibleYetError extends Error {}

/**
 * Indexing (ADR-008): embeds ONE approved version and stores the vector, replacing the vectors of
 * older versions of the same subject. It runs after an approval without a person asking, which is
 * the one documented exception to "AI only on request" (FR-AI-01); it decides nothing. The cost is
 * metered like every other AI call, and a month's budget that is used up stops it (the nightly
 * catch-up picks the version up once the budget allows).
 */
export async function indexVersion(
  ctx: Pick<JobContext, 'agencyId' | 'withAgency'>,
  embedder: EmbeddingClient,
  data: z.infer<typeof dataSchema>,
): Promise<IndexOutcome> {
  const agencyId = ctx.agencyId;
  if (!agencyId) throw new UnrecoverableError('missing_agency');

  const prepared = await ctx.withAgency(
    async (tx): Promise<{ skip: IndexOutcome } | { text: string }> => {
      const status = (await versionStatuses(tx, [data.versionId])).get(data.versionId);
      if (!status) throw new NotVisibleYetError('version_not_visible');
      if (status === 'draft') throw new NotVisibleYetError('version_not_approved_yet');
      if (status !== 'approved') return { skip: 'skipped_stale' as const };
      const version = await readApprovedVersionById(tx, data.versionId);
      if (!version || version.kind !== data.kind || version.subject.id !== data.subjectId)
        return { skip: 'skipped_stale' as const };
      if (data.kind === 'candidate_profile') {
        const candidate = await tx.candidate.findUnique({
          where: { id: data.subjectId },
          select: { status: true, mergedIntoId: true },
        });
        if (!candidate || candidate.status !== 'active' || candidate.mergedIntoId)
          return { skip: 'skipped_subject' as const };
      }
      const position =
        data.kind === 'success_profile'
          ? await tx.position.findUnique({
              where: { id: data.subjectId },
              select: { title: true, location: true },
            })
          : null;
      const text = embeddingTextOf(data.kind, version.content, position ?? undefined);
      if (!text) return { skip: 'skipped_empty' as const };
      try {
        await assertWithinBudget(tx, agencyId);
      } catch (error) {
        // Retrying cannot help within the month; the nightly catch-up tries again later.
        if (error instanceof ApiError && error.status === 402)
          throw new UnrecoverableError('budget_exceeded');
        throw error;
      }
      return { text };
    },
  );
  if ('skip' in prepared) return prepared.skip;

  let result;
  try {
    result = await embedder.embed({ texts: [prepared.text], inputType: 'document' });
  } catch (error) {
    // No key, a refused key and a bad request cannot be fixed by trying again.
    if (error instanceof AiProviderError && !error.retryable)
      throw new UnrecoverableError(error.message);
    throw error;
  }

  return ctx.withAgency(async (tx) => {
    // The version may have been replaced while Voyage was working: store nothing for a stale one.
    const status = (await versionStatuses(tx, [data.versionId])).get(data.versionId);
    if (status !== 'approved') return 'skipped_stale' as const;
    const vector = toVectorLiteral(result.vectors[0]!);
    await tx.$executeRaw`
      INSERT INTO "ProfileEmbedding" ("id", "agencyId", "kind", "subjectId", "versionId", "model", "embedding")
      VALUES (gen_random_uuid(), ${agencyId}::uuid, ${data.kind}, ${data.subjectId}::uuid,
              ${data.versionId}::uuid, ${result.model}, ${vector}::vector)
      ON CONFLICT ("kind", "versionId") DO UPDATE SET "embedding" = EXCLUDED."embedding", "model" = EXCLUDED."model"`;
    await tx.$executeRaw`
      DELETE FROM "ProfileEmbedding"
      WHERE "kind" = ${data.kind} AND "subjectId" = ${data.subjectId}::uuid AND "versionId" <> ${data.versionId}::uuid`;
    const generation = await tx.aiGeneration.create({
      data: {
        agencyId,
        purpose: 'embedding.index',
        requestedById: null,
        promptVersion: 'voyage-v1',
        model: result.model,
        inputRefs: { kind: data.kind, subjectId: data.subjectId, versionId: data.versionId },
        status: 'succeeded',
      },
      select: { id: true },
    });
    await recordEmbeddingCall(tx, {
      agencyId,
      aiGenerationId: generation.id,
      requestedById: null,
      positionId: data.kind === 'success_profile' ? data.subjectId : null,
      purpose: 'embedding.index',
      model: result.model,
      tokens: result.tokens,
      latencyMs: result.latencyMs,
    });
    return 'indexed' as const;
  });
}

/** Worker job `indexing:embed`. A version that is not visible yet is retried by the queue. */
export async function embedJob(ctx: JobContext, embedder: EmbeddingClient): Promise<void> {
  const data = dataSchema.parse(ctx.data);
  const outcome = await indexVersion(ctx, embedder, data);
  await ctx.progress({ outcome, versionId: data.versionId });
}

export interface CatchUpDeps {
  agencyIds(): Promise<string[]>;
  withAgency<T>(agencyId: string, fn: (tx: ScopedTx) => Promise<T>): Promise<T>;
  schedule(
    agencyId: string,
    data: { kind: EmbeddedKind; subjectId: string; versionId: string },
    options: { idempotencySuffix: string },
  ): Promise<void>;
  now?: () => Date;
}

/** Most versions queued for one agency in one nightly run. */
export const CATCH_UP_LIMIT = 200;

/** Approved profiles that have no vector yet (a missed job, a budget pause, a first run on old data). */
export async function missingEmbeddings(tx: ScopedTx, agencyId: string, limit = CATCH_UP_LIMIT) {
  return tx.$queryRaw<{ kind: EmbeddedKind; subjectId: string; versionId: string }[]>`
    SELECT a."kind"::text AS "kind", a."subjectId" AS "subjectId", a."approvedVersionId" AS "versionId"
    FROM "Artifact" a
    WHERE a."agencyId" = ${agencyId}::uuid
      AND a."kind"::text IN ('candidate_profile', 'success_profile')
      AND a."approvedVersionId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "ProfileEmbedding" e
        WHERE e."kind" = a."kind"::text AND e."versionId" = a."approvedVersionId")
      AND (a."kind"::text <> 'candidate_profile' OR EXISTS (
        SELECT 1 FROM "Candidate" c
        WHERE c."id" = a."subjectId" AND c."status" = 'active' AND c."mergedIntoId" IS NULL))
    ORDER BY a."updatedAt" DESC
    LIMIT ${limit}`;
}

/** Nightly (maintenance queue): queues indexing for approved profiles that have no vector. */
export async function runEmbeddingCatchUp(deps: CatchUpDeps): Promise<{ queued: number }> {
  const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  let queued = 0;
  for (const agencyId of await deps.agencyIds()) {
    const missing = await deps.withAgency(agencyId, (tx) => missingEmbeddings(tx, agencyId));
    for (const m of missing) {
      await deps.schedule(agencyId, m, { idempotencySuffix: `:${day}` });
      queued++;
    }
  }
  return { queued };
}
