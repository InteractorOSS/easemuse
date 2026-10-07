// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { addToPositionInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { addCandidateToPosition } from '@/server/pipeline/service';

/** Adds a confirmed candidate to the position as "sourced" (US-204). 409 if already there. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, addToPositionInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => addCandidateToPosition(tx, authed.actor, positionId, input),
        { userId: authed.userId },
      ),
    );
  });
}
