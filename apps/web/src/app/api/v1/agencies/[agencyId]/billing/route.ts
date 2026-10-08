// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { getBillingOverview } from '@/server/billing/service';

export const dynamic = 'force-dynamic';

/** Admin only: the agency's plan, seats, this month's usage and invoices (US-1308, FR-TEN-05). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(await getBillingOverview(authed.agency.id));
  });
}
