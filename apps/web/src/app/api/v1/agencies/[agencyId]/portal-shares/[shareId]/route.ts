// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { revokeShare } from '@/server/portal/publish';

/** Stops showing a share; the portal user no longer sees it. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; shareId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, shareId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(authed.agency.id, (tx) => revokeShare(tx, authed.actor, shareId), {
      userId: authed.userId,
    });
    return ok({ revoked: true });
  });
}
