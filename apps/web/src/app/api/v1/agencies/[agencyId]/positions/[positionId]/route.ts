// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { positionPatchSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getPosition, updatePosition } from '@/server/positions/service';

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getPosition(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Owner, lead or admin. Status changes go through `/status`, not here. */
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const patch = await parseBody(req, positionPatchSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => updatePosition(tx, authed.actor, positionId, patch),
        { userId: authed.userId },
      ),
    );
  });
}
