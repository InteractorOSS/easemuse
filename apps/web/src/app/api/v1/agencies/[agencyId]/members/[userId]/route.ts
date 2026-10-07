// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { updateMemberInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { updateMember } from '@/server/tenancy/members';

/** Change a member's role or deactivate them: admin only. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; userId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, userId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, updateMemberInputSchema);
    return ok(await updateMember(authed.actor, userId, input));
  });
}
