// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getAnalysisDetail } from '@/server/matching/detail';

/** One analysis in full: criteria with evidence, requirement statuses, gaps and what to confirm. Anyone who can see the position. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; analysisId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, analysisId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getAnalysisDetail(tx, authed.actor, analysisId), {
        userId: authed.userId,
      }),
    );
  });
}
