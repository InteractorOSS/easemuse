// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  benchmarkContentSchema,
  structuredJdContentSchema,
  type AgencyActor,
  type BenchmarkContent,
  type BenchmarkSuggestion,
  type StructuredJdContent,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError, notFound } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { BenchmarkInput } from '@/server/ai/prompts/market-benchmark';
import {
  findArtifact,
  getArtifactWithVersions,
  readApproved,
  saveEditToLatest,
} from '@/server/artifacts/service';
import { findVisiblePositions, requirePosition } from '@/server/positions/service';
import { computeOurData } from './own-data';

const conflict = (message: string) => new ApiError('conflict', message, { status: 409 });

export interface BenchmarkPlan {
  input: BenchmarkInput;
  inputRefs: {
    positionId: string;
    structuredJdVersionId: string | null;
    ourPositionIds: string[];
    webSearch: 'on' | 'off';
  };
}

/** How many of the agency's other positions are looked through for "Our data". */
const OWN_DATA_SCAN = 400;

const compensationText = (p: {
  compMin: unknown;
  compMax: unknown;
  compCurrency: string;
}): string | null =>
  p.compMin === null && p.compMax === null
    ? null
    : `${p.compMin ?? '…'} – ${p.compMax ?? '…'} ${p.compCurrency}`;

/**
 * Prepares A3 (US-108): the position, its APPROVED structured JD if there is one, and "Our data"
 * counted from the recruiter's visible past positions. The web part runs only when web search is
 * switched on in the configuration.
 */
export async function planBenchmark(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
  now: Date = new Date(),
): Promise<BenchmarkPlan> {
  await requirePosition(tx, actor, positionId, 'edit');
  const position = await tx.position.findUniqueOrThrow({
    where: { id: positionId },
    select: {
      title: true,
      location: true,
      department: true,
      workArrangement: true,
      compMin: true,
      compMax: true,
      compCurrency: true,
      requiredExperience: true,
      requiredSkills: true,
    },
  });
  const approvedJd = await readApproved(tx, {
    kind: 'structured_jd',
    subject: { type: 'position', id: positionId },
  });
  const jd = approvedJd ? structuredJdContentSchema.safeParse(approvedJd.content) : null;
  const others = await findVisiblePositions(tx, actor, { id: { not: positionId } }, OWN_DATA_SCAN);
  const ourData = computeOurData({ id: positionId, title: position.title }, others);
  const webSearch = getEnv().WEB_SEARCH;
  return {
    input: {
      generatedOn: now.toISOString().slice(0, 10),
      webSearchEnabled: webSearch === 'on',
      position: {
        title: position.title,
        location: position.location,
        department: position.department,
        workArrangement: position.workArrangement,
        compensation: compensationText({
          compMin: position.compMin === null ? null : Number(position.compMin),
          compMax: position.compMax === null ? null : Number(position.compMax),
          compCurrency: position.compCurrency,
        }),
        requiredExperience: position.requiredExperience,
        requiredSkills: position.requiredSkills,
      },
      structuredJd: jd?.success
        ? {
            sections: Object.entries(jd.data.sections).map(([section, s]) => ({
              section,
              summary: s.status === 'found' ? s.summary : '',
            })),
            requirements: jd.data.requirements.map((r) => ({
              id: r.id,
              section: r.section,
              text: r.text,
              category: r.category,
            })),
          }
        : null,
      ourData,
    },
    inputRefs: {
      positionId,
      structuredJdVersionId: approvedJd?.id ?? null,
      ourPositionIds: [...new Set(ourData.flatMap((o) => o.positionIds))],
      webSearch,
    },
  };
}

export type BenchmarkRunner = (
  purpose: 'market.benchmark',
  input: BenchmarkInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export function runBenchmark(
  run: BenchmarkRunner,
  actor: AgencyActor,
  positionId: string,
  plan: BenchmarkPlan,
  stream: { onDelta: (text: string) => void; signal: AbortSignal },
): Promise<AiRunResult> {
  return run('market.benchmark', plan.input, {
    agencyId: actor.agencyId,
    actor,
    positionId,
    subject: { type: 'position', id: positionId },
    inputRefs: plan.inputRefs,
    onDelta: stream.onDelta,
    signal: stream.signal,
  });
}

export type SuggestionDecision = 'accepted' | 'rejected';

export interface BenchmarkView {
  artifactId: string | null;
  versionId: string | null;
  versionStatus: 'draft' | 'approved' | null;
  content: BenchmarkContent | null;
  /** Decisions on the suggestions of the APPROVED version. */
  decisions: Record<string, SuggestionDecision>;
  /** Titles of the past positions "Our data" links to (only ones the viewer may open). */
  ourPositions: Record<string, { title: string; status: string }>;
  /** Whether accepting a suggestion has a structured JD to change. */
  hasStructuredJd: boolean;
  /** The current text of each requirement of the structured JD, so a change can be shown next to what it replaces. */
  requirementTexts: Record<string, string>;
  webSearchEnabled: boolean;
}

export async function getBenchmark(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<BenchmarkView> {
  await requirePosition(tx, actor, positionId, 'read');
  const jd = await findArtifact(tx, {
    kind: 'structured_jd',
    subject: { type: 'position', id: positionId },
  });
  const base: BenchmarkView = {
    artifactId: null,
    versionId: null,
    versionStatus: null,
    content: null,
    decisions: {},
    ourPositions: {},
    hasStructuredJd: Boolean(jd),
    requirementTexts: {},
    webSearchEnabled: getEnv().WEB_SEARCH === 'on',
  };
  const artifact = await findArtifact(tx, {
    kind: 'benchmark_report',
    subject: { type: 'position', id: positionId },
  });
  if (!artifact) return base;
  const full = await getArtifactWithVersions(tx, artifact.id);
  const latest = full.versions.find((v) => v.status === 'draft' || v.status === 'approved');
  const content = latest ? benchmarkContentSchema.safeParse(latest.content) : null;
  if (!latest || !content?.success) return { ...base, artifactId: artifact.id };

  const decisions: Record<string, SuggestionDecision> = {};
  if (latest.status === 'approved') {
    const rows = await tx.benchmarkDecision.findMany({
      where: { versionId: latest.id },
      select: { suggestionId: true, decision: true },
    });
    for (const r of rows) decisions[r.suggestionId] = r.decision as SuggestionDecision;
  }
  let requirementTexts: Record<string, string> = {};
  if (jd) {
    const jdFull = await getArtifactWithVersions(tx, jd.id);
    const jdLatest = jdFull.versions.find((v) => v.status === 'draft' || v.status === 'approved');
    const parsed = jdLatest ? structuredJdContentSchema.safeParse(jdLatest.content) : null;
    if (parsed?.success)
      requirementTexts = Object.fromEntries(parsed.data.requirements.map((r) => [r.id, r.text]));
  }
  const linked = [...new Set(content.data.ourData.flatMap((o) => o.positionIds))];
  const visible = linked.length
    ? await findVisiblePositions(tx, actor, { id: { in: linked } }, 200)
    : [];
  return {
    ...base,
    artifactId: artifact.id,
    versionId: latest.id,
    versionStatus: latest.status as 'draft' | 'approved',
    content: content.data,
    requirementTexts,
    decisions,
    ourPositions: Object.fromEntries(
      visible.map((p) => [p.id, { title: p.title, status: p.status }]),
    ),
  };
}

/** Applies one accepted suggestion to a copy of the structured JD content; null when it changes nothing. */
export function applySuggestion(
  jd: StructuredJdContent,
  suggestion: BenchmarkSuggestion,
  newId: () => string,
): StructuredJdContent | null {
  if (suggestion.kind === 'update_section') {
    const current = jd.sections[suggestion.section];
    if (current.status === 'found' && current.summary.trim() === suggestion.text.trim())
      return null;
    return {
      ...jd,
      sections: {
        ...jd.sections,
        [suggestion.section]: { status: 'found', summary: suggestion.text },
      },
    };
  }
  if (suggestion.kind === 'add_requirement') {
    const already = jd.requirements.some(
      (r) =>
        r.section === suggestion.section &&
        r.text.trim().toLowerCase() === suggestion.text.trim().toLowerCase(),
    );
    if (already) return null;
    if (jd.requirements.length >= 120)
      throw conflict('The job description already holds the most requirements it can');
    return {
      ...jd,
      requirements: [
        ...jd.requirements,
        {
          id: newId(),
          section: suggestion.section,
          text: suggestion.text,
          category: suggestion.category ?? 'preferred',
          quote: '',
        },
      ],
    };
  }
  const target = jd.requirements.find((r) => r.id === suggestion.requirementId);
  if (!target) throw conflict('That requirement is no longer in the job description');
  return {
    ...jd,
    requirements: jd.requirements.map((r) =>
      r.id === target.id
        ? { ...r, text: suggestion.text, category: suggestion.category ?? r.category }
        : r,
    ),
  };
}

/**
 * The recruiter's decision on one suggested change (US-108). A suggestion can be decided only on
 * the APPROVED benchmark (a draft feeds nothing). Accepting writes the change into a new DRAFT of
 * the structured JD, which still has to be approved on its own page; rejecting only records it.
 */
export async function decideSuggestion(
  tx: ScopedTx,
  actor: AgencyActor,
  input: {
    positionId: string;
    versionId: string;
    suggestionId: string;
    decision: SuggestionDecision;
  },
  newId: () => string = () => crypto.randomUUID(),
): Promise<{ decision: SuggestionDecision; appliedVersionId: string | null }> {
  await requirePosition(tx, actor, input.positionId, 'edit');
  const approved = await readApproved(tx, {
    kind: 'benchmark_report',
    subject: { type: 'position', id: input.positionId },
  });
  if (!approved || approved.id !== input.versionId) {
    throw conflict('Approve the benchmark first: suggestions are decided on the approved version');
  }
  const content = benchmarkContentSchema.parse(approved.content);
  const suggestion = content.suggestions.find((s) => s.id === input.suggestionId);
  if (!suggestion) throw notFound('Suggestion');
  const decided = await tx.benchmarkDecision.findUnique({
    where: {
      versionId_suggestionId: { versionId: input.versionId, suggestionId: input.suggestionId },
    },
    select: { id: true },
  });
  if (decided) throw conflict('This suggestion has already been decided');

  let appliedVersionId: string | null = null;
  if (input.decision === 'accepted') {
    const artifact = await findArtifact(tx, {
      kind: 'structured_jd',
      subject: { type: 'position', id: input.positionId },
    });
    if (!artifact)
      throw conflict('Structure the job description first: there is nothing to change yet');
    const full = await getArtifactWithVersions(tx, artifact.id);
    const latest = full.versions.find((v) => v.status === 'draft' || v.status === 'approved');
    const jd = latest ? structuredJdContentSchema.safeParse(latest.content) : null;
    if (!latest || !jd?.success)
      throw conflict('Structure the job description first: there is nothing to change yet');
    const changed = applySuggestion(jd.data, suggestion, newId);
    if (changed) {
      const saved = await saveEditToLatest(tx, actor, artifact.id, changed);
      appliedVersionId = saved.id;
    }
  }
  await tx.benchmarkDecision.create({
    data: {
      agencyId: actor.agencyId,
      positionId: input.positionId,
      versionId: input.versionId,
      suggestionId: input.suggestionId,
      decision: input.decision,
      decidedById: actor.userId,
      appliedVersionId,
    },
  });
  await tx.activityLog.create({
    data: {
      agencyId: actor.agencyId,
      actorType: 'user',
      actorId: actor.userId,
      action: `benchmark.suggestion_${input.decision}`,
      entityType: 'position',
      entityId: input.positionId,
      data: {
        suggestionId: input.suggestionId,
        kind: suggestion.kind,
        section: suggestion.section,
      },
    },
  });
  return { decision: input.decision, appliedVersionId };
}
