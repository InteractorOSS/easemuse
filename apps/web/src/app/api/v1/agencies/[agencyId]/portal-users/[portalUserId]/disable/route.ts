// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { disablePortalUser } from '@/server/portal/identity';

/** Turns a portal user's access off: sessions stop at the next request and open links stop working. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; portalUserId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, portalUserId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(authed.agency.id, (tx) => disablePortalUser(tx, authed.actor, portalUserId), {
      userId: authed.userId,
    });
    return ok({ disabled: true });
  });
}
