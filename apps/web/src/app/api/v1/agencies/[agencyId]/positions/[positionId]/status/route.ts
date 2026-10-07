// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { positionStatusInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { changeStatus } from '@/server/positions/service';

/** The only way to change a position's status (T-1-14). 409 for a move that is not allowed. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, positionStatusInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => changeStatus(tx, authed.actor, positionId, input),
        { userId: authed.userId },
      ),
    );
  });
}
