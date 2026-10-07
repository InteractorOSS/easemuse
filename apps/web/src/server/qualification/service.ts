// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  QUALIFICATION_TOPICS,
  matchAnalysisContentSchema,
  qualificationContentSchema,
  successProfileContentSchema,
  type AgencyActor,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { CallQuestionsInput } from '@/server/ai/prompts/call-questions';
import type { QualifyNotesInput } from '@/server/ai/prompts/qualify-notes';
import { redactText } from '@/server/ai/redaction';
import {
  addDraftVersion,
  findArtifact,
  findOrCreateArtifact,
  readApproved,
} from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';

type Runner<P extends string, I> = (
  purpose: P,
  input: I,
  ctx: AiRunContext,
) => Promise<AiRunResult>;
interface Deps<P extends string, I> {
  run: Runner<P, I>;
  withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;
}
interface StreamOptions {
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
}

/** Qualification starts once the candidate has been contacted and ends when the resume work begins. */
const QUALIFYING_STATES = ['contacting', 'interested', 'qualified'];

export interface QualificationOverview {
  state: string;
  callQuestions: { artifactId: string; approvedVersionId: string | null } | null;
  qualification: { artifactId: string; approvedVersionId: string | null } | null;
}

async function overviewOf(
  tx: ScopedTx,
  entryId: string,
  state: string,
): Promise<QualificationOverview> {
  const subject = { type: 'pipeline_entry' as const, id: entryId };
  const [questions, qualification] = await Promise.all([
    findArtifact(tx, { kind: 'call_questions', subject }),
    findArtifact(tx, { kind: 'qualification', subject }),
  ]);
  const view = (a: { id: string; approvedVersionId: string | null } | null) =>
    a ? { artifactId: a.id, approvedVersionId: a.approvedVersionId } : null;
  return { state, callQuestions: view(questions), qualification: view(qualification) };
}

export async function getQualification(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<QualificationOverview> {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  return overviewOf(tx, entryId, entry.state);
}

async function requireQualifying(tx: ScopedTx, actor: AgencyActor, entryId: string) {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (!QUALIFYING_STATES.includes(entry.state)) {
    throw new ApiError('conflict', 'Contact the candidate before the qualification call', {
      status: 409,
    });
  }
  return entry;
}

export interface CallQuestionsPlan {
  input: CallQuestionsInput;
  artifactId: string;
  inputRefs: Record<string, unknown>;
}

/**
 * Prepares A13 (T-6-01, US-601). The open points come from the match analysis only if the
 * recruiter reviewed it; an unreviewed draft does not feed later steps.
 */
export async function planCallQuestions(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<CallQuestionsPlan> {
  const entry = await requireQualifying(tx, actor, entryId);
  const [analysis, success, position] = await Promise.all([
    readApproved(tx, { kind: 'match_analysis', subject: { type: 'pipeline_entry', id: entryId } }),
    readApproved(tx, {
      kind: 'success_profile',
      subject: { type: 'position', id: entry.positionId },
    }),
    tx.position.findUniqueOrThrow({
      where: { id: entry.positionId },
      select: { title: true, location: true },
    }),
  ]);
  const analysisContent = analysis ? matchAnalysisContentSchema.safeParse(analysis.content) : null;
  const toConfirm = analysisContent?.success
    ? analysisContent.data.criteria.flatMap((c) => c.toConfirm)
    : [];
  const profile = success ? successProfileContentSchema.safeParse(success.content) : null;
  const artifact = await findOrCreateArtifact(tx, {
    agencyId: actor.agencyId,
    kind: 'call_questions',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  return {
    artifactId: artifact.id,
    input: {
      position,
      mustHaves: profile?.success
        ? profile.data.criteria.filter((c) => c.category === 'must_have').map((c) => c.text)
        : [],
      toConfirm,
    },
    inputRefs: {
      entryId,
      matchAnalysisVersionId: analysis?.id ?? null,
      successProfileVersionId: success?.id ?? null,
    },
  };
}

export async function generateCallQuestions(
  deps: Deps<'call.questions', CallQuestionsInput>,
  actor: AgencyActor,
  entryId: string,
  options: StreamOptions = {},
) {
  const plan = await deps.withAgency((tx) => planCallQuestions(tx, actor, entryId));
  const entry = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const result = await deps.run('call.questions', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId: entry.positionId,
    subject: { type: 'pipeline_entry', id: entryId },
    artifactId: plan.artifactId,
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { artifactId: plan.artifactId, generationId: result.generationId, draft: result.draft };
}

/** Takes the candidate's name out of the notes, whole and in parts, so the model never sees it. */
export function scrubName(notes: string, fullName: string): string {
  const parts = [fullName, ...fullName.split(/\s+/)]
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .sort((a, b) => b.length - a.length);
  let out = notes;
  for (const part of new Set(parts)) {
    out = out.replace(
      new RegExp(
        `(?<![\\p{L}\\p{N}])${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
        'giu',
      ),
      'the candidate',
    );
  }
  return out;
}

export interface QualifyPlan {
  input: QualifyNotesInput;
  artifactId: string;
  inputRefs: Record<string, unknown>;
}

/** Prepares A14 (T-6-02, US-602): the notes are scrubbed of the name and protected details. */
export async function planQualification(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  notes: string,
): Promise<QualifyPlan> {
  const entry = await requireQualifying(tx, actor, entryId);
  const [candidate, position] = await Promise.all([
    tx.candidate.findUniqueOrThrow({
      where: { id: entry.candidateId },
      select: { fullName: true },
    }),
    tx.position.findUniqueOrThrow({ where: { id: entry.positionId }, select: { title: true } }),
  ]);
  const redacted = redactText(scrubName(notes, candidate.fullName));
  const artifact = await findOrCreateArtifact(tx, {
    agencyId: actor.agencyId,
    kind: 'qualification',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  return {
    artifactId: artifact.id,
    input: { notes: redacted.value, position },
    inputRefs: { entryId, redactedCategories: redacted.removed },
  };
}

export async function generateQualification(
  deps: Deps<'notes.qualify', QualifyNotesInput>,
  actor: AgencyActor,
  entryId: string,
  notes: string,
  options: StreamOptions = {},
) {
  const plan = await deps.withAgency((tx) => planQualification(tx, actor, entryId, notes));
  const entry = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const result = await deps.run('notes.qualify', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId: entry.positionId,
    subject: { type: 'pipeline_entry', id: entryId },
    artifactId: plan.artifactId,
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { artifactId: plan.artifactId, generationId: result.generationId, draft: result.draft };
}

/** A blank record for filling in by hand (FR-QUA-02): no AI involved. */
export async function createBlankQualification(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<QualificationOverview> {
  const entry = await requireQualifying(tx, actor, entryId);
  const artifact = await findOrCreateArtifact(tx, {
    agencyId: actor.agencyId,
    kind: 'qualification',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  await addDraftVersion(tx, {
    agencyId: actor.agencyId,
    artifactId: artifact.id,
    content: qualificationContentSchema.parse({}),
    origin: 'human',
    createdById: actor.userId,
  });
  return overviewOf(tx, entryId, entry.state);
}

export { QUALIFICATION_TOPICS };
