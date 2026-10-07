// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import { planStructureJd, runStructureJd } from '@/server/positions/structure-jd';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * "Structure JD" (US-103): streams A1 as Server-Sent Events and saves the result as a draft.
 * Permission and input checks happen first, so they fail as plain JSON errors (403, 404, 422).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const plan = await withAgency(
      authed.agency.id,
      (tx) => planStructureJd(tx, authed.actor, positionId),
      { userId: authed.userId },
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      runStructureJd(gateway.run, authed.actor, positionId, plan, stream),
    );
  });
}
