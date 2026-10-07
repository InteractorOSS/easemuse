// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { inviteMemberInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { createInvite, listPendingInvites } from '@/server/tenancy/members';

/** Pending invitations: admin only. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(await listPendingInvites(authed.actor));
  });
}

/** Invite a member by email: admin only. 409 `invite_already_pending` or `already_member`. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, inviteMemberInputSchema);
    return created(await createInvite(authed.actor, authed.agency, input));
  });
}
