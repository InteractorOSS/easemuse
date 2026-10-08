// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type { AgencyActor, CandidateProfileContent } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import type { EmbeddingClient, EmbedRequest } from '@/server/ai/voyage';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from '@/server/ai/voyage';
import { indexVersion } from '@/server/embeddings/indexing';
import {
  addDraftVersion,
  approveVersion,
  createArtifact,
  findArtifact,
} from '@/server/artifacts/service';
import { createPosition } from '@/server/positions/service';

type Run = <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;

/** Words hashed into the vector's dimensions: texts that share words are close, so search is testable without Voyage. */
function bagOfWords(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)) {
    let hash = 7;
    for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) % 1_000_003;
    vector[hash % EMBEDDING_DIMENSIONS]! += 1;
  }
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vector.map((x) => x / norm);
}

export interface FakeEmbedder extends EmbeddingClient {
  calls: { texts: string[]; inputType: EmbedRequest['inputType'] }[];
  /** Everything ever sent, as one string. */
  sent(): string;
  failWith?: Error;
}

export function fakeEmbedder(): FakeEmbedder {
  const embedder: FakeEmbedder = {
    calls: [],
    sent: () => embedder.calls.flatMap((c) => c.texts).join('\n'),
    async embed(request) {
      if (embedder.failWith) throw embedder.failWith;
      embedder.calls.push({ texts: request.texts, inputType: request.inputType });
      return {
        model: EMBEDDING_MODEL,
        vectors: request.texts.map(bagOfWords),
        tokens: request.texts.join(' ').split(/\s+/).length,
        latencyMs: 1,
      };
    },
  };
  return embedder;
}

export const profileOf = (
  over: Partial<CandidateProfileContent> = {},
): CandidateProfileContent => ({
  fullName: 'Alex Kim',
  email: 'alex.kim@example.com',
  phone: '+82 10-1234-5678',
  currentPosition: { title: 'HR Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'HR Director',
      start: '2019',
      end: null,
      current: true,
      summary: 'Alex led payroll and talent acquisition for 20 people. Mail alex.kim@example.com.',
    },
  ],
  education: [],
  coreSkills: ['payroll', 'talent acquisition'],
  industryExperience: [],
  technicalSkills: [],
  leadershipExperience: null,
  teamSize: '20',
  careerProgression: null,
  location: 'Seoul',
  workAuthorization: null,
  compensationExpectation: null,
  majorAchievements: [],
  potentialMotivation: null,
  potentialConcerns: [],
  ...over,
});

async function approve(
  run: Run,
  actor: AgencyActor,
  kind: 'candidate_profile' | 'success_profile',
  subject: { type: 'candidate' | 'position'; id: string },
  content: unknown,
): Promise<string> {
  const artifact =
    (await run((tx) => findArtifact(tx, { kind, subject }))) ??
    (await run((tx) => createArtifact(tx, { agencyId: actor.agencyId, kind, subject })));
  const version = await run((tx) =>
    addDraftVersion(tx, {
      agencyId: actor.agencyId,
      artifactId: artifact.id,
      content,
      origin: 'human',
      createdById: actor.userId,
    }),
  );
  await run((tx) => approveVersion(tx, actor, version.id));
  return version.id;
}

/** An active candidate with an approved profile. Returns where to find them. */
export async function candidateWithProfile(
  run: Run,
  actor: AgencyActor,
  over: Partial<CandidateProfileContent> = {},
  options: { status?: 'active' | 'draft' | 'discarded' } = {},
): Promise<{ candidateId: string; versionId: string }> {
  const content = profileOf(over);
  const candidateId = (
    await run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: actor.agencyId,
          fullName: content.fullName ?? 'Unnamed',
          source: 'linkedin',
          createdById: actor.userId,
          status: 'active',
        },
        select: { id: true },
      }),
    )
  ).id;
  const versionId = await approve(
    run,
    actor,
    'candidate_profile',
    { type: 'candidate', id: candidateId },
    content,
  );
  if (options.status && options.status !== 'active') {
    await run((tx) =>
      tx.candidate.update({ where: { id: candidateId }, data: { status: options.status } }),
    );
  }
  return { candidateId, versionId };
}

export const successProfileOf = (summary: string, criteria: string[] = []) => ({
  summary,
  criteria: criteria.map((text, i) => ({
    id: `c${i + 1}`,
    text,
    category: 'must_have' as const,
    basis: 'jd' as const,
  })),
  expectations: { sixMonths: '', twelveMonths: '' },
  keyChallenges: [],
});

/** A position, with an approved success profile unless `profile` is false. */
export async function positionWithProfile(
  run: Run,
  actor: AgencyActor,
  clientId: string,
  options: {
    title?: string;
    location?: string;
    summary?: string;
    profile?: boolean;
    criteria?: string[];
  } = {},
): Promise<{ positionId: string; versionId: string | null }> {
  const position = await run((tx) =>
    createPosition(tx, actor, {
      clientId,
      title: options.title ?? `Head of HR ${randomUUID().slice(0, 4)}`,
      location: options.location ?? 'Seoul',
    }),
  );
  if (options.profile === false) return { positionId: position.id, versionId: null };
  const versionId = await approve(
    run,
    actor,
    'success_profile',
    { type: 'position', id: position.id },
    successProfileOf(
      options.summary ?? 'A senior HR leader with payroll and talent acquisition',
      options.criteria ?? ['payroll experience'],
    ),
  );
  return { positionId: position.id, versionId };
}

/** Indexes the candidate's current approved profile with the given embedder. */
export async function indexCandidate(
  run: Run,
  agencyId: string,
  embedder: EmbeddingClient,
  candidateId: string,
  versionId: string,
) {
  return indexVersion({ agencyId, withAgency: run }, embedder, {
    kind: 'candidate_profile',
    subjectId: candidateId,
    versionId,
  });
}
