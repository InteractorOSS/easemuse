// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { refreshAgencyBilling } from '@/server/billing/service';

/** Reads the agency's plan and seat limit from Billing Server again (owner or admin). */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return ok(await refreshAgencyBilling(authed.actor, id));
  });
}
