// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { confirmCandidateInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { confirmAddAndPlan } from '@/server/candidates/confirm-and-add';

/**
 * Confirms a pasted candidate, adds them to this position and says whether the match analysis can
 * start (brief 4.2, 5.1). One transaction: a failure leaves nothing half done. 409
 * `possible_duplicate` until the recruiter picks a resolution, like the plain confirm. The response
 * carries the pipeline `entry` and `analysis: { ready, reason }`; when ready, the caller starts the
 * streamed analysis for `entry.id` (nothing has been analyzed here).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, confirmCandidateInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => confirmAddAndPlan(tx, authed.actor, positionId, input),
        { userId: authed.userId },
      ),
    );
  });
}
