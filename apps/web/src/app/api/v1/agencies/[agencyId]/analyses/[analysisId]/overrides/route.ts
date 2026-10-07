// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { matchOverrideInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { overrideScore } from '@/server/matching/overrides';

/**
 * Overrides the overall score or one criterion's, with a reason, or removes an override (`score:
 * null`). The entry's owner, a lead or an admin. The computed value is kept beside the override.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; analysisId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, analysisId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, matchOverrideInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => overrideScore(tx, authed.actor, analysisId, input),
        { userId: authed.userId },
      ),
    );
  });
}
