// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { saveOfferInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getOffer, saveOffer } from '@/server/offers/service';

type Ctx = { params: Promise<{ agencyId: string; entryId: string }> };

/** The offer record of a candidate (empty defaults until the first save). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getOffer(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Saves milestones, counteroffer risk and dates. Schedules the next reminder. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, saveOfferInputSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => saveOffer(tx, authed.actor, entryId, input), {
        userId: authed.userId,
      }),
    );
  });
}
