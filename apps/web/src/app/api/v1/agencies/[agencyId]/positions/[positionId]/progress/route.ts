// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getPositionProgress } from '@/server/positions/progress';

export const dynamic = 'force-dynamic';

/** Where the position stands in the hiring process (G#10). Anyone who can see the position. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => getPositionProgress(tx, authed.actor, positionId),
        { userId: authed.userId },
      ),
    );
  });
}
