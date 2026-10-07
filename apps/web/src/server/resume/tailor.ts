// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  candidateProfileContentSchema,
  successProfileContentSchema,
  tailoredResumeContentSchema,
  tailoredResumeText,
  type AgencyActor,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult, Gateway } from '@/server/ai';
import { runFactCheck } from '@/server/ai/fact-check';
import { renderCandidateForMatch } from '@/server/ai/prompts/match-analyze';
import { resumeTailorPrompt, type ResumeTailorInput } from '@/server/ai/prompts/resume-tailor';
import { redactStructured } from '@/server/ai/redaction';
import {
  findArtifact,
  findOrCreateArtifact,
  latestDraft,
  readApproved,
  setFactCheck,
} from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';

/** The resume is prepared once the call is done and until the candidate's approval is on record. */
const RESUME_STATES = ['qualified', 'resume_ready', 'candidate_approved'];

export interface TailorOverview {
  state: string;
  artifactId: string | null;
  approvedVersionId: string | null;
  blind: boolean | null;
}

export async function getTailoredResume(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<TailorOverview> {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'tailored_resume',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  const latest = await tx.tailoredResume.findFirst({
    where: { entryId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { blind: true },
  });
  return {
    state: entry.state,
    artifactId: artifact?.id ?? null,
    approvedVersionId: artifact?.approvedVersionId ?? null,
    blind: latest?.blind ?? null,
  };
}

export interface TailorPlan {
  entryId: string;
  artifactId: string;
  input: ResumeTailorInput;
  /** What the draft is checked against: the confirmed profile, and the original resume text if there is one. */
  sources: { label: string; text: string }[];
  inputRefs: Record<string, unknown>;
}

/**
 * Prepares A15 (T-7-01, US-701). Needs the confirmed profile and success profile. The model gets the
 * profile without identity; the name and contact details only reach the result's header (and not
 * even that for a blind resume).
 */
export async function planTailoredResume(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  blind: boolean,
): Promise<TailorPlan> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (!RESUME_STATES.includes(entry.state)) {
    throw new ApiError('conflict', 'Qualify the candidate before preparing the resume', {
      status: 409,
    });
  }
  const [profile, success, position, candidate, original] = await Promise.all([
    readApproved(tx, {
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: entry.candidateId },
    }),
    readApproved(tx, {
      kind: 'success_profile',
      subject: { type: 'position', id: entry.positionId },
    }),
    tx.position.findUniqueOrThrow({
      where: { id: entry.positionId },
      select: { title: true, location: true },
    }),
    tx.candidate.findUniqueOrThrow({
      where: { id: entry.candidateId },
      select: { fullName: true },
    }),
    tx.candidateDocument.findFirst({
      where: { candidateId: entry.candidateId, kind: 'resume', extractedText: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, extractedText: true },
    }),
  ]);
  if (!profile)
    throw new ApiError('conflict', "Confirm the candidate's profile first", { status: 409 });
  if (!success)
    throw new ApiError('conflict', "Confirm the position's success profile first", { status: 409 });
  const parsed = candidateProfileContentSchema.parse(profile.content);
  const header = {
    name: candidate.fullName,
    email: parsed.email,
    phone: parsed.phone,
    location: parsed.location,
  };
  const redacted = redactStructured({
    currentPosition: parsed.currentPosition,
    careerHistory: parsed.careerHistory,
    education: parsed.education,
    coreSkills: parsed.coreSkills,
    technicalSkills: parsed.technicalSkills,
    industryExperience: parsed.industryExperience,
    leadershipExperience: parsed.leadershipExperience,
    teamSize: parsed.teamSize,
    majorAchievements: parsed.majorAchievements,
  });
  const artifact = await findOrCreateArtifact(tx, {
    agencyId: actor.agencyId,
    kind: 'tailored_resume',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  return {
    entryId,
    artifactId: artifact.id,
    input: {
      position,
      successProfile: successProfileContentSchema.parse(success.content),
      profile: redacted.value,
      header,
      blind,
    },
    sources: [
      {
        label: 'Confirmed profile',
        text: renderCandidateForMatch({ ...parsed, ...redacted.value }),
      },
      ...(original?.extractedText
        ? [{ label: 'Original resume', text: original.extractedText }]
        : []),
    ],
    inputRefs: {
      entryId,
      blind,
      candidateProfileVersionId: profile.id,
      successProfileVersionId: success.id,
      originalDocumentId: original?.id ?? null,
      redactedCategories: redacted.removed,
    },
  };
}

type Runner = (
  purpose: 'resume.tailor',
  input: ResumeTailorInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

/**
 * Writes the draft and then fact-checks it against the profile and the original resume (X1); the
 * warnings are stored with the draft and every one needs a decision before approval (FR-AI-06).
 * If the check cannot run the draft is kept but cannot be approved (`factcheck_not_run`).
 */
export async function generateTailoredResume(
  deps: {
    run: Runner;
    gateway: Pick<Gateway, 'run'>;
    withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;
  },
  actor: AgencyActor,
  entryId: string,
  blind: boolean,
  options: { onDelta?: (text: string) => void; signal?: AbortSignal } = {},
) {
  const plan = await deps.withAgency((tx) => planTailoredResume(tx, actor, entryId, blind));
  const entry = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const ctx: AiRunContext = {
    agencyId: actor.agencyId,
    actor,
    positionId: entry.positionId,
    subject: { type: 'pipeline_entry', id: entryId },
    artifactId: plan.artifactId,
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const result = await deps.run('resume.tailor', plan.input, ctx);
  if (!result.draft)
    throw new ApiError('internal_error', 'The resume was not saved', { status: 500 });
  const content = tailoredResumeContentSchema.parse(
    resumeTailorPrompt.toContent!(resumeTailorPrompt.schema.parse(result.output), plan.input),
  );
  const versionId = result.draft.versionId;
  const factCheck = await runFactCheck(
    deps.gateway,
    { agencyId: actor.agencyId, actor, positionId: entry.positionId, inputRefs: { versionId } },
    { draft: tailoredResumeText(content), sources: plan.sources },
  );
  await deps.withAgency((tx) => setFactCheck(tx, versionId, factCheck));
  return {
    artifactId: plan.artifactId,
    generationId: result.generationId,
    draft: result.draft,
    warnings: factCheck.warnings.length,
  };
}

/** Runs the fact check again on the newest draft, after the recruiter edited it (T-7-02). */
export async function recheckTailoredResume(
  deps: {
    gateway: Pick<Gateway, 'run'>;
    withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;
  },
  actor: AgencyActor,
  entryId: string,
) {
  const prepared = await deps.withAgency(async (tx) => {
    const plan = await planTailoredResume(tx, actor, entryId, false);
    const artifact = await findArtifact(tx, {
      kind: 'tailored_resume',
      subject: { type: 'pipeline_entry', id: entryId },
    });
    const draft = artifact ? await latestDraft(tx, artifact.id) : null;
    if (!draft) throw notFound('Draft');
    return { plan, draft };
  });
  const content = tailoredResumeContentSchema.parse(prepared.draft.content);
  const position = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const factCheck = await runFactCheck(
    deps.gateway,
    {
      agencyId: actor.agencyId,
      actor,
      positionId: position.positionId,
      inputRefs: { versionId: prepared.draft.id },
    },
    { draft: tailoredResumeText(content), sources: prepared.plan.sources },
  );
  return deps.withAgency((tx) => setFactCheck(tx, prepared.draft.id, factCheck));
}
