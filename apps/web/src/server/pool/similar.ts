// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  POOL_MATCH_LIMIT,
  candidateEmbeddingText,
  candidateProfileContentSchema,
  similarCandidatesContentSchema,
  successProfileContentSchema,
  successProfileEmbeddingText,
  type AgencyActor,
  type SimilarCandidatesContent,
} from '@easemuse/core';
import { withAgency, type Scope, type ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import { AiProviderError } from '@/server/ai/errors';
import { assertWithinBudget, recordEmbeddingCall } from '@/server/ai/ledger';
import type { PoolSimilarInput } from '@/server/ai/prompts/pool-similar';
import { redactText } from '@/server/ai/redaction';
import { toVectorLiteral, type EmbeddingClient } from '@/server/ai/voyage';
import { findArtifact, getArtifactWithVersions, readApproved } from '@/server/artifacts/service';
import { requirePosition } from '@/server/positions/service';

/** Longest candidate card sent to the model. */
const CARD_CHARS = 1_800;

export interface PoolDeps {
  embedder: EmbeddingClient;
  /** The tenant scope; the process-wide one unless a test brings its own. */
  scope?: Pick<Scope, 'withAgency'>;
  run: (
    purpose: 'pool.similar',
    input: PoolSimilarInput,
    ctx: AiRunContext,
  ) => Promise<AiRunResult>;
  log?: (message: string, data: Record<string, unknown>) => void;
  now?: () => Date;
}

interface Retrieved {
  id: string;
  /** Cosine similarity (semantic) or text rank (keyword). A reference only. */
  score: number;
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'are',
  'was',
  'will',
  'has',
  'have',
  'from',
  'you',
  'your',
  'our',
  'their',
  'into',
  'than',
  'such',
  'must',
  'nice',
  'preferred',
  'have',
  'after',
  'months',
  'year',
  'role',
  'summary',
  'challenge',
  'criteria',
  'ability',
  'experience',
]);

/** Search words for the keyword fallback: the most frequent plain words of the profile text. */
export function keywordTerms(text: string, max = 20): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const word = raw.replace(/[^\p{L}\p{N}]/gu, '');
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([w]) => w);
}

/** How many active candidates the pool has, how many have no vector yet, and how many are already in this position. */
export async function poolStats(tx: ScopedTx, positionId: string) {
  const [stats] = await tx.$queryRaw<
    { poolSize: number; notIndexed: number; alreadyInPosition: number }[]
  >`
    SELECT
      count(*)::int AS "poolSize",
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM "ProfileEmbedding" e WHERE e."kind" = 'candidate_profile' AND e."subjectId" = c."id"))::int AS "notIndexed",
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM "PipelineEntry" p WHERE p."positionId" = ${positionId}::uuid AND p."candidateId" = c."id"))::int AS "alreadyInPosition"
    FROM "Candidate" c
    WHERE c."status" = 'active' AND c."mergedIntoId" IS NULL`;
  return stats ?? { poolSize: 0, notIndexed: 0, alreadyInPosition: 0 };
}

/** The nearest indexed candidates by cosine distance, leaving out people already in this position. */
export async function nearestCandidates(
  tx: ScopedTx,
  agencyId: string,
  positionId: string,
  vector: readonly number[],
  limit = POOL_MATCH_LIMIT,
): Promise<Retrieved[]> {
  const literal = toVectorLiteral(vector);
  // Let the index keep scanning past rows the filters remove (pgvector 0.8 iterative scan).
  await tx.$executeRaw`SELECT set_config('hnsw.iterative_scan', 'relaxed_order', true)`;
  const rows = await tx.$queryRaw<{ id: string; distance: number }[]>`
    SELECT * FROM (
      SELECT e."subjectId" AS id, (e."embedding" <=> ${literal}::vector)::float8 AS distance
      FROM "ProfileEmbedding" e
      JOIN "Candidate" c ON c."id" = e."subjectId"
      WHERE e."agencyId" = ${agencyId}::uuid AND e."kind" = 'candidate_profile'
        AND c."status" = 'active' AND c."mergedIntoId" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "PipelineEntry" p WHERE p."positionId" = ${positionId}::uuid AND p."candidateId" = c."id")
      ORDER BY e."embedding" <=> ${literal}::vector
      LIMIT ${limit}
    ) near ORDER BY distance ASC, id DESC`;
  return rows.map((r) => ({ id: r.id, score: Math.max(0, Math.min(1, 1 - r.distance)) }));
}

/** Full-text fallback when embeddings are not available (ADR-008: search degrades to full-text). */
export async function keywordCandidates(
  tx: ScopedTx,
  positionId: string,
  text: string,
  limit = POOL_MATCH_LIMIT,
): Promise<Retrieved[]> {
  const terms = keywordTerms(text);
  if (terms.length === 0) return [];
  const tsquery = terms.map((t) => `${t}:*`).join(' | ');
  const rows = await tx.$queryRaw<{ id: string; rank: number }[]>`
    SELECT c."id", ts_rank_cd(c."searchText", q.query)::float8 AS rank
    FROM "Candidate" c, to_tsquery('simple', ${tsquery}) AS q(query)
    WHERE c."status" = 'active' AND c."mergedIntoId" IS NULL AND c."searchText" @@ q.query
      AND NOT EXISTS (SELECT 1 FROM "PipelineEntry" p WHERE p."positionId" = ${positionId}::uuid AND p."candidateId" = c."id")
    ORDER BY rank DESC, c."id" DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ id: r.id, score: r.rank }));
}

/** The approved profile of a candidate as a card without identity, or null when there is none. */
export async function candidateCard(
  tx: ScopedTx,
  candidateId: string,
): Promise<{ text: string; versionId: string } | null> {
  const approved = await readApproved(tx, {
    kind: 'candidate_profile',
    subject: { type: 'candidate', id: candidateId },
  });
  if (!approved) return null;
  const profile = candidateProfileContentSchema.safeParse(approved.content);
  if (!profile.success) return null;
  const text = redactText(candidateEmbeddingText(profile.data)).value.slice(0, CARD_CHARS);
  return text ? { text, versionId: approved.id } : null;
}

const today = (now: Date) => now.toISOString().slice(0, 10);

export interface PoolRunResult {
  /** Null when nothing matched, so no draft was made. */
  result: AiRunResult | null;
  basis: 'semantic' | 'keyword';
  found: number;
}

/**
 * "Find in my pool" (US-205): looks for existing candidates that resemble the position's CONFIRMED
 * success profile, and has the assistant write one line on why each may fit. It runs because a
 * recruiter pressed the button; it adds nobody to the position, and the similarity figure is a
 * reference that decides nothing. If the embedding service is not available the search falls back
 * to keywords and says so.
 */
export async function findInPool(
  deps: PoolDeps,
  actor: AgencyActor,
  positionId: string,
  options: { signal?: AbortSignal } = {},
): Promise<PoolRunResult> {
  const as = { userId: actor.userId };
  const scope = deps.scope ?? { withAgency };
  const log = deps.log ?? (() => undefined);

  const prepared = await scope.withAgency(
    actor.agencyId,
    async (tx) => {
      await requirePosition(tx, actor, positionId, 'edit');
      const [position, approved] = await Promise.all([
        tx.position.findUniqueOrThrow({
          where: { id: positionId },
          select: { title: true, location: true },
        }),
        readApproved(tx, {
          kind: 'success_profile',
          subject: { type: 'position', id: positionId },
        }),
      ]);
      if (!approved) {
        throw new ApiError(
          'conflict',
          'Confirm the success profile first: the search starts from the confirmed version',
          { status: 409 },
        );
      }
      await assertWithinBudget(tx, actor.agencyId);
      const profile = successProfileContentSchema.parse(approved.content);
      return {
        position,
        profileVersionId: approved.id,
        profileText: successProfileEmbeddingText(profile, position),
      };
    },
    as,
  );

  // The query vector. A failure of the provider is not fatal: the keyword search takes over.
  let vector: number[] | null = null;
  try {
    const embedded = await deps.embedder.embed({
      texts: [prepared.profileText],
      inputType: 'query',
      ...(options.signal ? { signal: options.signal } : {}),
    });
    vector = embedded.vectors[0]!;
    await scope.withAgency(
      actor.agencyId,
      (tx) =>
        recordEmbeddingCall(tx, {
          agencyId: actor.agencyId,
          aiGenerationId: null,
          requestedById: actor.userId,
          positionId,
          purpose: 'embedding.query',
          model: embedded.model,
          tokens: embedded.tokens,
          latencyMs: embedded.latencyMs,
        }),
      as,
    );
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;
    log('pool.embedding_unavailable', {
      positionId,
      status: error.status,
      retryable: error.retryable,
    });
  }
  const basis: 'semantic' | 'keyword' = vector ? 'semantic' : 'keyword';

  const gathered = await scope.withAgency(
    actor.agencyId,
    async (tx) => {
      const found = vector
        ? await nearestCandidates(tx, actor.agencyId, positionId, vector)
        : await keywordCandidates(tx, positionId, prepared.profileText);
      const stats = await poolStats(tx, positionId);
      const cards: (PoolSimilarInput['candidates'][number] & { versionId: string })[] = [];
      for (const hit of found) {
        const card = await candidateCard(tx, hit.id);
        if (!card) continue;
        cards.push({
          ref: `C${cards.length + 1}`,
          candidateId: hit.id,
          similarity: vector ? hit.score : null,
          text: card.text,
          versionId: card.versionId,
        });
      }
      return { cards, stats };
    },
    as,
  );
  if (gathered.cards.length === 0) return { result: null, basis, found: 0 };

  const input: PoolSimilarInput = {
    generatedOn: today(deps.now?.() ?? new Date()),
    basis,
    notIndexed: gathered.stats.notIndexed,
    poolSize: gathered.stats.poolSize,
    alreadyInPosition: gathered.stats.alreadyInPosition,
    position: prepared.position,
    successProfileText: prepared.profileText,
    candidates: gathered.cards.map((c) => ({
      ref: c.ref,
      candidateId: c.candidateId,
      similarity: c.similarity,
      text: c.text,
    })),
  };
  const result = await deps.run('pool.similar', input, {
    agencyId: actor.agencyId,
    actor,
    positionId,
    subject: { type: 'position', id: positionId },
    inputRefs: {
      positionId,
      successProfileVersionId: prepared.profileVersionId,
      basis,
      candidates: gathered.cards.map((c) => ({
        candidateId: c.candidateId,
        profileVersionId: c.versionId,
      })),
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { result, basis, found: gathered.cards.length };
}

export interface PoolMatchView {
  candidate: {
    id: string;
    fullName: string;
    currentTitle: string | null;
    location: string | null;
    skills: string[];
    yearsExperience: number | null;
    doNotContact: boolean;
  };
  /** A reference figure (0 to 1) or null for a keyword search. Never used to hide anyone. */
  similarity: number | null;
  reason: string;
  caveat: string | null;
}

export interface PoolMatchesView {
  artifactId: string | null;
  versionId: string | null;
  /** `draft` until approved: the list is a suggestion either way. */
  versionStatus: 'draft' | 'approved' | null;
  generatedOn: string | null;
  basis: 'semantic' | 'keyword' | null;
  items: PoolMatchView[];
  /** Live figures, so the page can say what was and was not searched. */
  poolSize: number;
  notIndexed: number;
  alreadyInPosition: number;
}

/** The latest "Find in my pool" result of a position, with the people's current details. */
export async function getPoolMatches(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<PoolMatchesView> {
  await requirePosition(tx, actor, positionId, 'read');
  const stats = await poolStats(tx, positionId);
  const empty: PoolMatchesView = {
    artifactId: null,
    versionId: null,
    versionStatus: null,
    generatedOn: null,
    basis: null,
    items: [],
    poolSize: stats.poolSize,
    notIndexed: stats.notIndexed,
    alreadyInPosition: stats.alreadyInPosition,
  };
  const artifact = await findArtifact(tx, {
    kind: 'similar_candidates',
    subject: { type: 'position', id: positionId },
  });
  if (!artifact) return empty;
  const full = await getArtifactWithVersions(tx, artifact.id);
  const latest = full.versions.find((v) => v.status === 'draft' || v.status === 'approved');
  const content = latest ? similarCandidatesContentSchema.safeParse(latest.content) : null;
  if (!latest || !content?.success) return { ...empty, artifactId: artifact.id };
  const people = await tx.candidate.findMany({
    where: { id: { in: content.data.items.map((i) => i.candidateId) }, status: 'active' },
    select: {
      id: true,
      fullName: true,
      currentTitle: true,
      location: true,
      skills: true,
      yearsExperience: true,
      doNotContact: true,
    },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  const items: PoolMatchView[] = [];
  for (const item of (content.data as SimilarCandidatesContent).items) {
    const p = byId.get(item.candidateId);
    if (!p) continue; // deleted or discarded since
    items.push({
      candidate: { ...p, skills: p.skills.slice(0, 8) },
      similarity: item.similarity,
      reason: item.reason,
      caveat: item.caveat,
    });
  }
  return {
    ...empty,
    artifactId: artifact.id,
    versionId: latest.id,
    versionStatus: latest.status as 'draft' | 'approved',
    generatedOn: content.data.generatedOn,
    basis: content.data.basis,
    items,
  };
}
