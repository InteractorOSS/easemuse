// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getDashboard } from '@/server/matching/dashboard';

/** The candidate review dashboard of a position (US-304, brief 5.3). Anyone who can see the position. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getDashboard(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}
