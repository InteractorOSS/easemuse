// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { positionInputSchema, positionListFilterSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { pageQuerySchema } from '@/lib/http/pagination';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody, parseQuery } from '@/lib/http/validation';
import { createPosition, listPositions } from '@/server/positions/service';

type Ctx = { params: Promise<{ agencyId: string }> };

/** Positions the person may see (the agency's visibility rule applies to recruiters), newest first. */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const query = parseQuery(req, pageQuerySchema.extend(positionListFilterSchema.shape));
    const { items, nextCursor } = await withAgency(
      authed.agency.id,
      (tx) => listPositions(tx, authed.actor, query),
      { userId: authed.userId },
    );
    return ok(items, { nextCursor });
  });
}

/** Creates a position in Draft (US-102). The creator owns it unless a lead or admin names someone else. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, positionInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => createPosition(tx, authed.actor, input), {
        userId: authed.userId,
      }),
    );
  });
}
