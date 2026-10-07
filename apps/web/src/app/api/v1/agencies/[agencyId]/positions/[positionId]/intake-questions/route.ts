// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import {
  getIntakeQuestionsArtifact,
  planIntakeQuestions,
  runIntakeQuestions,
} from '@/server/positions/intake-questions';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** Where the question list lives (null before the first draft). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => getIntakeQuestionsArtifact(tx, authed.actor, positionId),
        { userId: authed.userId },
      ),
    );
  });
}

/** Writes the intake questions with A2 (streamed). 409 until the structured JD is approved. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const plan = await withAgency(
      authed.agency.id,
      (tx) => planIntakeQuestions(tx, authed.actor, positionId),
      { userId: authed.userId },
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      runIntakeQuestions(gateway.run, authed.actor, positionId, plan, stream),
    );
  });
}
