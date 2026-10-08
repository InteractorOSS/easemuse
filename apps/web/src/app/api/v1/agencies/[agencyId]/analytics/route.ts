// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { analyticsQuerySchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { getAnalytics } from '@/server/analytics/service';

export const dynamic = 'force-dynamic';

/**
 * The 9 KPIs, the stage funnel, the source table and the capacity panel for a date range, optionally
 * narrowed by client, position and recruiter (US-1101). Recruiters get their own figures.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const query = parseQuery(req, analyticsQuerySchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => getAnalytics(tx, authed.actor, query), {
        userId: authed.userId,
      }),
    );
  });
}
