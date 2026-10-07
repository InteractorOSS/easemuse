// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { confirmCandidateInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { confirmCandidate } from '@/server/candidates/confirm';

/**
 * Confirms a draft candidate (US-202, US-203). 409 `possible_duplicate` when someone already in the
 * database looks the same and no `resolution` (`create` with a reason, `merge` or `link` with a
 * `targetId`) was chosen.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, confirmCandidateInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => confirmCandidate(tx, authed.actor, input), {
        userId: authed.userId,
      }),
    );
  });
}
