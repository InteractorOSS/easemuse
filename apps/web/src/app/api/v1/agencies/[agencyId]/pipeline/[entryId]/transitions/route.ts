// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { pipelineTransitionInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { transitionEntry } from '@/server/pipeline/service';

/**
 * Moves a candidate to a new state. The entry's owner, a lead or an admin. 409 `invalid_transition`
 * or `guard_failed { guards[] }`; 422 for a missing reason.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, pipelineTransitionInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => transitionEntry(tx, authed.actor, entryId, input),
        { userId: authed.userId },
      ),
    );
  });
}
