// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  candidateProfileContentSchema,
  matchAnalysisContentSchema,
  qualificationContentSchema,
  submissionReportContentSchema,
  submissionReportText,
  successProfileContentSchema,
  type AgencyActor,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult, Gateway } from '@/server/ai';
import { runFactCheck } from '@/server/ai/fact-check';
import { renderCandidateForMatch } from '@/server/ai/prompts/match-analyze';
import { reportDraftPrompt, type ReportDraftInput } from '@/server/ai/prompts/report-draft';
import { redactStructured } from '@/server/ai/redaction';
import {
  findArtifact,
  findOrCreateArtifact,
  latestDraft,
  readApproved,
  setFactCheck,
} from '@/server/artifacts/service';
import { requireEntry } from '@/server/pipeline/service';

/** The report is drafted once the call is done and until the candidate has been submitted. */
const REPORT_STATES = ['qualified', 'resume_ready', 'candidate_approved'];

export interface ReportOverview {
  state: string;
  artifactId: string | null;
  approvedVersionId: string | null;
}

export async function getReport(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<ReportOverview> {
  const entry = await requireEntry(tx, actor, entryId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'submission_report',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  return {
    state: entry.state,
    artifactId: artifact?.id ?? null,
    approvedVersionId: artifact?.approvedVersionId ?? null,
  };
}

export interface ReportPlan {
  artifactId: string;
  input: ReportDraftInput;
  sources: { label: string; text: string }[];
  inputRefs: Record<string, unknown>;
}

/**
 * Prepares A16 (T-8-01, US-801). Only APPROVED records feed the report: the confirmed profile, the
 * match analysis the recruiter reviewed, and the qualification the recruiter confirmed. When one of
 * the last two is missing its sections are not drafted; they say "Not yet confirmed" and the draft
 * lists what is missing.
 */
export async function planReportDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
): Promise<ReportPlan> {
  const entry = await requireEntry(tx, actor, entryId, 'edit');
  if (!REPORT_STATES.includes(entry.state)) {
    throw new ApiError('conflict', 'Qualify the candidate before drafting the report', {
      status: 409,
    });
  }
  const subject = { type: 'pipeline_entry' as const, id: entryId };
  const [profile, analysis, qualification, successProfile, position] = await Promise.all([
    readApproved(tx, {
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: entry.candidateId },
    }),
    readApproved(tx, { kind: 'match_analysis', subject }),
    readApproved(tx, { kind: 'qualification', subject }),
    readApproved(tx, {
      kind: 'success_profile',
      subject: { type: 'position', id: entry.positionId },
    }),
    tx.position.findUniqueOrThrow({
      where: { id: entry.positionId },
      select: { title: true, location: true },
    }),
  ]);
  if (!profile)
    throw new ApiError('conflict', "Confirm the candidate's profile first", { status: 409 });
  const parsed = candidateProfileContentSchema.parse(profile.content);
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
    location: parsed.location,
  });
  const analysisContent = analysis ? matchAnalysisContentSchema.safeParse(analysis.content) : null;
  const qualificationContent = qualification
    ? qualificationContentSchema.safeParse(qualification.content)
    : null;
  const profileCriteria = successProfile
    ? successProfileContentSchema.safeParse(successProfile.content)
    : null;
  const criterionText = new Map(
    profileCriteria?.success ? profileCriteria.data.criteria.map((c) => [c.id, c.text]) : [],
  );
  const analysisInput: ReportDraftInput['analysis'] = analysisContent?.success
    ? {
        criteria: analysisContent.data.criteria.map((c) => ({
          key: c.key,
          level: c.level,
          summary: c.summary,
        })),
        unmet: analysisContent.data.requirements
          .filter((r) => r.status === 'not_met')
          .map((r) => criterionText.get(r.criterionId) ?? r.criterionId),
        toConfirm: analysisContent.data.criteria.flatMap((c) => c.toConfirm),
      }
    : null;
  const qualificationFields = qualificationContent?.success
    ? qualificationContent.data.fields
    : null;
  const artifact = await findOrCreateArtifact(tx, {
    agencyId: actor.agencyId,
    kind: 'submission_report',
    subject,
  });
  const input: ReportDraftInput = {
    position,
    profile: redacted.value,
    analysis: analysisInput,
    qualification: qualificationFields,
  };
  return {
    artifactId: artifact.id,
    input,
    sources: [
      {
        label: 'Confirmed profile',
        text: renderCandidateForMatch({ ...parsed, ...redacted.value }),
      },
      ...(analysisInput
        ? [
            {
              label: 'Reviewed match analysis',
              text: analysisInput.criteria
                .map((c) => `${c.key} [${c.level}]: ${c.summary}`)
                .join('\n'),
            },
          ]
        : []),
      ...(qualificationFields
        ? [
            {
              label: 'Confirmed qualification',
              text: Object.entries(qualificationFields)
                .map(([k, f]) => `${k}: ${f.value}${f.level ? ` (${f.level})` : ''}`)
                .join('\n'),
            },
          ]
        : []),
    ],
    inputRefs: {
      entryId,
      candidateProfileVersionId: profile.id,
      matchAnalysisVersionId: analysis?.id ?? null,
      qualificationVersionId: qualification?.id ?? null,
      redactedCategories: redacted.removed,
    },
  };
}

type Runner = (
  purpose: 'report.draft',
  input: ReportDraftInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

/**
 * Drafts sections 1 to 13 and fact-checks them against the sources (X1). Section 14 stays empty: the
 * AI may not write it, and the report cannot be approved without it (brief 10, ADR-006).
 */
export async function generateReport(
  deps: {
    run: Runner;
    gateway: Pick<Gateway, 'run'>;
    withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;
  },
  actor: AgencyActor,
  entryId: string,
  options: { onDelta?: (text: string) => void; signal?: AbortSignal } = {},
) {
  const plan = await deps.withAgency((tx) => planReportDraft(tx, actor, entryId));
  const entry = await deps.withAgency((tx) =>
    tx.pipelineEntry.findUniqueOrThrow({ where: { id: entryId }, select: { positionId: true } }),
  );
  const result = await deps.run('report.draft', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId: entry.positionId,
    subject: { type: 'pipeline_entry', id: entryId },
    artifactId: plan.artifactId,
    inputRefs: plan.inputRefs,
    ...(options.onDelta ? { onDelta: options.onDelta } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!result.draft)
    throw new ApiError('internal_error', 'The report was not saved', { status: 500 });
  const content = submissionReportContentSchema.parse(
    reportDraftPrompt.toContent!(reportDraftPrompt.schema.parse(result.output), plan.input),
  );
  const versionId = result.draft.versionId;
  const factCheck = await runFactCheck(
    deps.gateway,
    { agencyId: actor.agencyId, actor, positionId: entry.positionId, inputRefs: { versionId } },
    { draft: submissionReportText(content), sources: plan.sources },
  );
  await deps.withAgency((tx) => setFactCheck(tx, versionId, factCheck));
  return {
    artifactId: plan.artifactId,
    generationId: result.generationId,
    draft: result.draft,
    missingInputs: content.missingInputs,
    warnings: factCheck.warnings.length,
  };
}

/** Runs the fact check again on the newest draft, after the recruiter edited it. */
export async function recheckReport(
  deps: {
    gateway: Pick<Gateway, 'run'>;
    withAgency: <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;
  },
  actor: AgencyActor,
  entryId: string,
) {
  const prepared = await deps.withAgency(async (tx) => {
    const plan = await planReportDraft(tx, actor, entryId);
    const draft = await latestDraft(tx, plan.artifactId);
    if (!draft) throw notFound('Draft');
    const entry = await tx.pipelineEntry.findUniqueOrThrow({
      where: { id: entryId },
      select: { positionId: true },
    });
    return { plan, draft, positionId: entry.positionId };
  });
  const content = submissionReportContentSchema.parse(prepared.draft.content);
  const factCheck = await runFactCheck(
    deps.gateway,
    {
      agencyId: actor.agencyId,
      actor,
      positionId: prepared.positionId,
      inputRefs: { versionId: prepared.draft.id },
    },
    { draft: submissionReportText(content), sources: prepared.plan.sources },
  );
  return deps.withAgency((tx) => setFactCheck(tx, prepared.draft.id, factCheck));
}
