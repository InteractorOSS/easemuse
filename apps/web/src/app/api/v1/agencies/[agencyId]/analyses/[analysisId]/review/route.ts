// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { markReviewed } from '@/server/matching/detail';

/** "Mark reviewed": approves the analysis so later steps may use it. The entry's owner, a lead or an admin. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; analysisId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, analysisId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => markReviewed(tx, authed.actor, analysisId), {
        userId: authed.userId,
      }),
    );
  });
}
