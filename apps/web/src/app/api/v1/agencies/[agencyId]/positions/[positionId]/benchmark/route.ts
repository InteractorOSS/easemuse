// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import { getBenchmark, planBenchmark, runBenchmark } from '@/server/benchmark/service';

export const dynamic = 'force-dynamic';
// The web search step comes before the writing and can take a minute or more.
export const maxDuration = 300;

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** The latest benchmark of the position with "Our data", "Web", suggestions and decisions. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getBenchmark(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Runs the benchmark (A3, streamed): the agency's own data, then web search when it is switched on. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const plan = await withAgency(
      authed.agency.id,
      (tx) => planBenchmark(tx, authed.actor, positionId),
      { userId: authed.userId },
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      runBenchmark(gateway.run, authed.actor, positionId, plan, stream),
    );
  });
}
