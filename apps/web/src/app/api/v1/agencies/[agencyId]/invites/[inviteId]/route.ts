// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, noContent } from '@/lib/http/responses';
import { revokeInvite } from '@/server/tenancy/members';

/** Revoke a pending invitation: admin only. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; inviteId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, inviteId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    await revokeInvite(authed.actor, inviteId);
    return noContent();
  });
}
