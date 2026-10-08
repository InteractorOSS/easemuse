// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { assignPlanInputSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { assignAgencyPlan } from '@/server/billing/service';

/** Puts the agency on a Billing Server plan (owner or admin). Logged in both logs. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    const { planId } = await parseBody(req, assignPlanInputSchema);
    return ok(await assignAgencyPlan(authed.actor, id, planId));
  });
}
