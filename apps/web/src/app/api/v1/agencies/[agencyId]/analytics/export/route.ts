// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { analyticsExportQuerySchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { analyticsCsv, getAnalytics } from '@/server/analytics/service';

export const dynamic = 'force-dynamic';

/** One analytics table as CSV, with the same filters as the page (US-1102, FR-ANA-04). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { table, ...query } = parseQuery(req, analyticsExportQuerySchema);
    const result = await withAgency(
      authed.agency.id,
      (tx) => getAnalytics(tx, authed.actor, query),
      { userId: authed.userId },
    );
    return new Response(analyticsCsv(result, table), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="analytics-${table}-${result.range.from}_${result.range.to}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
