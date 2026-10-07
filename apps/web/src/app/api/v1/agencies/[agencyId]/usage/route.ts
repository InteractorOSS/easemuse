// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { getAgencyUsage, monthQuerySchema } from '@/server/tenancy/agency-usage';

/** This month's AI cost by purpose against the budget (US-1304). Admin only. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const { month } = parseQuery(req, monthQuerySchema);
    return ok(await getAgencyUsage(authed.agency.id, month));
  });
}
