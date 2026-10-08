// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { analyticsQuerySchema } from '@/server/analytics/query';
import { getAnalytics } from '@/server/analytics/service';

export const dynamic = 'force-dynamic';

/**
 * Recruiting KPIs, results by source and capacity (US-1101). Any member; the agency's position
 * visibility rule decides which positions count. `?from&to` (inclusive days), `clientId`,
 * `positionId`, `ownerId`.
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
