// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  OPEN_POSITION_STATUSES,
  PORTFOLIO_POSITION_LIMIT,
  portfolioFitContentSchema,
  successProfileContentSchema,
  successProfileEmbeddingText,
  type AgencyActor,
  type PortfolioFitContent,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import type { AiRunContext, AiRunResult } from '@/server/ai';
import type { PortfolioCheckInput } from '@/server/ai/prompts/portfolio-check';
import { findArtifact, getArtifactWithVersions, readApproved } from '@/server/artifacts/service';
import { findVisiblePositions } from '@/server/positions/service';
import { candidateCard } from './similar';

export interface PortfolioPlan {
  input: PortfolioCheckInput;
  inputRefs: {
    candidateId: string;
    profileVersionId: string;
    positions: { positionId: string; successProfileVersionId: string }[];
  };
}

/**
 * Prepares A9 for a candidate (US-206). The candidate comes from the APPROVED profile, without
 * name or contact details. Open positions are those the actor may see in intake, sourcing or
 * interviewing; ones without a confirmed success profile, or that already hold this candidate, are
 * listed as not assessed (with the reason) instead of silently left out.
 */
export async function planPortfolioCheck(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
  now: Date = new Date(),
): Promise<PortfolioPlan> {
  const candidate = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { status: true, mergedIntoId: true },
  });
  if (!candidate || candidate.status !== 'active' || candidate.mergedIntoId)
    throw notFound('Candidate');
  const card = await candidateCard(tx, candidateId);
  if (!card) {
    throw new ApiError('conflict', 'This candidate has no confirmed profile yet', { status: 409 });
  }
  const open = await findVisiblePositions(
    tx,
    actor,
    { status: { in: [...OPEN_POSITION_STATUSES] } },
    PORTFOLIO_POSITION_LIMIT + 1,
  );
  const truncated = open.length > PORTFOLIO_POSITION_LIMIT;
  const considered = open.slice(0, PORTFOLIO_POSITION_LIMIT);
  const entries = await tx.pipelineEntry.findMany({
    where: { candidateId, positionId: { in: considered.map((p) => p.id) } },
    select: { positionId: true },
  });
  const inPipeline = new Set(entries.map((e) => e.positionId));

  const notAssessed: PortfolioFitContent['notAssessed'] = [];
  const positions: PortfolioCheckInput['positions'] = [];
  const refs: PortfolioPlan['inputRefs']['positions'] = [];
  for (const p of considered) {
    if (inPipeline.has(p.id)) {
      notAssessed.push({ positionId: p.id, why: 'already_in_pipeline' });
      continue;
    }
    const approved = await readApproved(tx, {
      kind: 'success_profile',
      subject: { type: 'position', id: p.id },
    });
    const profile = approved ? successProfileContentSchema.safeParse(approved.content) : null;
    if (!approved || !profile?.success) {
      notAssessed.push({ positionId: p.id, why: 'no_success_profile' });
      continue;
    }
    positions.push({
      ref: `P${positions.length + 1}`,
      positionId: p.id,
      title: p.title,
      location: p.location,
      profileText: successProfileEmbeddingText(profile.data),
    });
    refs.push({ positionId: p.id, successProfileVersionId: approved.id });
  }
  if (positions.length === 0) {
    throw new ApiError(
      'conflict',
      'There is no open position with a confirmed success profile to compare with',
      { status: 409 },
    );
  }
  return {
    input: {
      generatedOn: now.toISOString().slice(0, 10),
      candidateText: card.text,
      positions,
      notAssessed,
      truncated,
    },
    inputRefs: { candidateId, profileVersionId: card.versionId, positions: refs },
  };
}

export type PortfolioRunner = (
  purpose: 'portfolio.check',
  input: PortfolioCheckInput,
  ctx: AiRunContext,
) => Promise<AiRunResult>;

export function runPortfolioCheck(
  run: PortfolioRunner,
  actor: AgencyActor,
  candidateId: string,
  plan: PortfolioPlan,
  options: { signal?: AbortSignal } = {},
): Promise<AiRunResult> {
  return run('portfolio.check', plan.input, {
    agencyId: actor.agencyId,
    actor,
    subject: { type: 'candidate', id: candidateId },
    inputRefs: plan.inputRefs,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export interface PortfolioItemView {
  position: { id: string; title: string; location: string; clientName: string; status: string };
  fit: 'strong' | 'moderate' | 'low';
  reason: string;
}

export interface PortfolioView {
  artifactId: string | null;
  versionId: string | null;
  versionStatus: 'draft' | 'approved' | null;
  generatedOn: string | null;
  items: PortfolioItemView[];
  notAssessed: {
    position: { id: string; title: string; clientName: string };
    why: PortfolioFitContent['notAssessed'][number]['why'];
  }[];
  truncated: boolean;
}

/** The latest "Check open positions" result of a candidate, with the positions' current details. */
export async function getPortfolio(
  tx: ScopedTx,
  actor: AgencyActor,
  candidateId: string,
): Promise<PortfolioView> {
  const exists = await tx.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true },
  });
  if (!exists) throw notFound('Candidate');
  const none: PortfolioView = {
    artifactId: null,
    versionId: null,
    versionStatus: null,
    generatedOn: null,
    items: [],
    notAssessed: [],
    truncated: false,
  };
  const artifact = await findArtifact(tx, {
    kind: 'portfolio_fit',
    subject: { type: 'candidate', id: candidateId },
  });
  if (!artifact) return none;
  const full = await getArtifactWithVersions(tx, artifact.id);
  const latest = full.versions.find((v) => v.status === 'draft' || v.status === 'approved');
  const content = latest ? portfolioFitContentSchema.safeParse(latest.content) : null;
  if (!latest || !content?.success) return { ...none, artifactId: artifact.id };

  // Only positions the viewer may see are named; others are left out of the list.
  const visible = await findVisiblePositions(
    tx,
    actor,
    { id: { in: [...content.data.items, ...content.data.notAssessed].map((i) => i.positionId) } },
    200,
  );
  const clients = await tx.client.findMany({
    where: { id: { in: [...new Set(visible.map((p) => p.clientId))] } },
    select: { id: true, name: true },
  });
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const byId = new Map(visible.map((p) => [p.id, p]));
  return {
    artifactId: artifact.id,
    versionId: latest.id,
    versionStatus: latest.status as 'draft' | 'approved',
    generatedOn: content.data.generatedOn,
    truncated: content.data.truncated,
    items: content.data.items.flatMap((i) => {
      const p = byId.get(i.positionId);
      return p
        ? [
            {
              position: {
                id: p.id,
                title: p.title,
                location: p.location,
                clientName: clientName.get(p.clientId) ?? '',
                status: p.status,
              },
              fit: i.fit,
              reason: i.reason,
            },
          ]
        : [];
    }),
    notAssessed: content.data.notAssessed.flatMap((i) => {
      const p = byId.get(i.positionId);
      return p
        ? [
            {
              position: { id: p.id, title: p.title, clientName: clientName.get(p.clientId) ?? '' },
              why: i.why,
            },
          ]
        : [];
    }),
  };
}
