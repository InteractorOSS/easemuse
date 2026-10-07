// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { listTimeline, timelineQuerySchema } from '@/server/activity/service';

/** The timeline of one entity: `?entityType=position&entityId=<uuid>`. Any member of the agency. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const query = parseQuery(req, timelineQuerySchema);
    const { items, nextCursor } = await withAgency(
      authed.agency.id,
      (tx) => listTimeline(tx, query),
      { userId: authed.userId },
    );
    return ok(items, { nextCursor });
  });
}
