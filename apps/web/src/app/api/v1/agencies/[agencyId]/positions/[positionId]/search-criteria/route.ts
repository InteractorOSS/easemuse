// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import {
  getSearchCriteriaArtifact,
  planSearchCriteria,
  runSearchCriteria,
} from '@/server/positions/search-criteria';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** Where the search sheet lives (null before the first draft). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => getSearchCriteriaArtifact(tx, authed.actor, positionId),
        { userId: authed.userId },
      ),
    );
  });
}

/** Writes the search criteria sheet with A6 (streamed). 409 until the success profile is confirmed. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const plan = await withAgency(
      authed.agency.id,
      (tx) => planSearchCriteria(tx, authed.actor, positionId),
      { userId: authed.userId },
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      runSearchCriteria(gateway.run, authed.actor, positionId, plan, stream),
    );
  });
}
