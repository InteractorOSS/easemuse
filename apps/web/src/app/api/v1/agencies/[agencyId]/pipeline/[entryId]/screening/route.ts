// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { screeningInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getScreening, saveScreening } from '@/server/screening/service';

type Ctx = { params: Promise<{ agencyId: string; entryId: string }> };

/** The screening checklist and classification of a candidate in a position. Anyone who can see the position. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getScreening(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Saves checklist items (rating and notes). The entry's owner, a lead or an admin. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, screeningInputSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => saveScreening(tx, authed.actor, entryId, input), {
        userId: authed.userId,
      }),
    );
  });
}
