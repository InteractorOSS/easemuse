// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { MATCH_WEIGHT_KEYS, type AgencyActor, type CriterionResult } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { matchAnalyzePrompt } from '@/server/ai/prompts/match-analyze';
import {
  addDraftVersion,
  approveVersion,
  createArtifact,
  findOrCreateArtifact,
} from '@/server/artifacts/service';
import type { MatchRunner } from '@/server/matching/analyze';
import { addCandidateToPosition } from '@/server/pipeline/service';
import { createPosition } from '@/server/positions/service';

type Run = <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;

export const matchCandidateProfile = {
  fullName: 'Alex Kim',
  email: 'alex@x.com',
  phone: null,
  currentPosition: { title: 'HR Director', company: 'Northwind' },
  careerHistory: [
    {
      company: 'Northwind',
      title: 'HR Director',
      start: '2019',
      end: null,
      current: true,
      summary: 'Managed a team of 20',
    },
  ],
  education: [],
  coreSkills: ['payroll'],
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
};
export const matchSuccessProfile = {
  summary: 'A senior HR leader',
  criteria: [{ id: 'c1', text: '8 years in HR', category: 'must_have', basis: 'jd' }],
  expectations: { sixMonths: '', twelveMonths: '' },
  keyChallenges: [],
};
const criterion = (
  key: (typeof MATCH_WEIGHT_KEYS)[number],
  level: CriterionResult['level'],
  score: number,
): CriterionResult => ({
  key,
  level,
  score,
  summary: 's',
  evidence: [{ type: 'inferred' }],
  toConfirm: [],
});
export const matchModelOutput = {
  criteria: [
    criterion('coreCompetencies', 'strong', 90),
    criterion('relevantExperience', 'strong', 85),
    criterion('industryFunctional', 'partial', 60),
    criterion('careerLevel', 'partial', 70),
    criterion('locationArrangement', 'gap', 20),
    criterion('educationCertification', 'strong', 100),
    criterion('compensationOther', 'unknown', 50),
  ],
  requirements: [{ criterionId: 'c1', status: 'met', evidence: [] }],
};

/** A gateway stand-in: stores the draft the way the real one does, without calling a model. */
export function fakeMatchRunner(
  run: Run,
  agencyId: string,
  createdById: string,
  output: unknown = matchModelOutput,
  hook?: (entryId: string) => void | Promise<void>,
): MatchRunner {
  return (async (_purpose, input, ctx) => {
    if (ctx.subject) await hook?.(ctx.subject.id);
    const content = matchAnalyzePrompt.toContent!(matchAnalyzePrompt.schema.parse(output), input);
    const draft = await run(async (tx) => {
      const artifact = await findOrCreateArtifact(tx, {
        agencyId,
        kind: 'match_analysis',
        subject: ctx.subject!,
      });
      const version = await addDraftVersion(tx, {
        agencyId,
        artifactId: artifact.id,
        content,
        origin: 'ai',
        createdById,
      });
      return { artifactId: artifact.id, versionId: version.id, version: version.version };
    });
    return {
      generationId: randomUUID(),
      output,
      draft,
      usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 },
      costUsd: 0,
    };
  }) as MatchRunner;
}

/** A candidate in a position with both approved profiles, ready to analyze. */
export async function readyMatchEntry(
  run: Run,
  actor: AgencyActor,
  clientId: string,
  opts: { positionId?: string; approveProfile?: boolean } = {},
) {
  const positionId =
    opts.positionId ??
    (
      await run((tx) =>
        createPosition(tx, actor, { clientId, title: 'Head of HR', location: 'Seoul' }),
      )
    ).id;
  const candidateId = (
    await run((tx) =>
      tx.candidate.create({
        data: {
          agencyId: actor.agencyId,
          fullName: 'Alex Kim',
          source: 'linkedin',
          createdById: actor.userId,
          status: 'active',
        },
        select: { id: true },
      }),
    )
  ).id;
  const entry = await run((tx) => addCandidateToPosition(tx, actor, positionId, { candidateId }));
  const approve = async (
    kind: 'candidate_profile' | 'success_profile',
    subject: { type: 'candidate' | 'position'; id: string },
    content: unknown,
  ) => {
    const existing = await run((tx) =>
      tx.artifact.findFirst({ where: { kind, subjectId: subject.id } }),
    );
    if (existing) return existing.approvedVersionId;
    const artifact = await run((tx) =>
      createArtifact(tx, { agencyId: actor.agencyId, kind, subject }),
    );
    const v = await run((tx) =>
      addDraftVersion(tx, {
        agencyId: actor.agencyId,
        artifactId: artifact.id,
        content,
        origin: 'human',
        createdById: actor.userId,
      }),
    );
    await run((tx) => approveVersion(tx, actor, v.id));
    return v.id;
  };
  if (opts.approveProfile !== false)
    await approve(
      'candidate_profile',
      { type: 'candidate', id: candidateId },
      matchCandidateProfile,
    );
  await approve('success_profile', { type: 'position', id: positionId }, matchSuccessProfile);
  return { entry, positionId, candidateId };
}
