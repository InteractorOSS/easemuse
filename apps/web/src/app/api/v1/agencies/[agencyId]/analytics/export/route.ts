// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { exportQuerySchema } from '@/server/analytics/query';
import { analyticsCsv, getAnalytics } from '@/server/analytics/service';

export const dynamic = 'force-dynamic';

/** One analytics table as CSV, with the same filters as the page (US-1102). `?table=kpis|conversion|sources|capacity`. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { table, ...query } = parseQuery(req, exportQuerySchema);
    const view = await withAgency(authed.agency.id, (tx) => getAnalytics(tx, authed.actor, query), {
      userId: authed.userId,
    });
    return new Response(analyticsCsv(view, table), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="easemuse-${table}-${view.range.from}-to-${view.range.to}.csv"`,
        'cache-control': 'no-store',
      },
    });
  });
}
