// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import {
  getPatternSummaryArtifact,
  planPatternSummary,
  runPatternSummary,
} from '@/server/knowledge/summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** Where the summary lives (null before the first draft). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => getPatternSummaryArtifact(tx, authed.actor, positionId),
        { userId: authed.userId },
      ),
    );
  });
}

/**
 * Writes the AI summary of the patterns in the client's history with A18 (FR-KNW-03), only when the
 * recruiter asks. 409 while no candidate has been put forward to the client. The result is a draft
 * with a link to the records behind every sentence.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const plan = await withAgency(
      authed.agency.id,
      (tx) => planPatternSummary(tx, authed.actor, positionId),
      { userId: authed.userId },
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      runPatternSummary(gateway.run, authed.actor, positionId, plan, stream),
    );
  });
}
