// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { supportDecisionSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { decideSupportGrant } from '@/server/support/access';

/** Admin only: approve or deny a pending request, or revoke an active grant. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; grantId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, grantId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(
      await decideSupportGrant(authed.actor, grantId, await parseBody(req, supportDecisionSchema)),
    );
  });
}
