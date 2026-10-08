// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getClientHistory } from '@/server/knowledge/history';

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/**
 * "What has this client liked before?" (FR-KNW-01): the candidates put forward to this position's
 * client, what the hiring managers did with them, their ratings and the reasons they gave. Only
 * positions the caller can see.
 */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getClientHistory(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}
