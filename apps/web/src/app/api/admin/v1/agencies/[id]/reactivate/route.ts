// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { agencyStatusReasonSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { setAgencyStatus } from '@/server/tenancy/agencies';

/** Owner and admin only; the reason is required and goes to the platform audit log. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    const { reason } = await parseBody(req, agencyStatusReasonSchema);
    return ok(await setAgencyStatus(id, 'active', reason, authed.actor));
  });
}
