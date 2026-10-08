// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { patternsQuerySchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { getPatterns } from '@/server/knowledge/patterns';

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/**
 * The pattern reports for the seven questions of brief 14 (FR-KNW-02), for the position's client
 * (`?scope=client`, the default) or for every client whose positions the caller can see
 * (`?scope=agency`). Descriptive: every number carries its record count and a small-sample flag.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { scope } = parseQuery(req, patternsQuerySchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => getPatterns(tx, authed.actor, positionId, scope), {
        userId: authed.userId,
      }),
    );
  });
}
