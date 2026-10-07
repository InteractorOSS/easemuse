// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { agencyBudgetInputSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { setAgencyBudget } from '@/server/tenancy/agencies';

/** Sets an agency's monthly AI budget (null removes the limit). Owner and admin only. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    const { aiMonthlyBudgetUsd } = await parseBody(req, agencyBudgetInputSchema);
    return ok(await setAgencyBudget(id, aiMonthlyBudgetUsd, authed.actor));
  });
}
