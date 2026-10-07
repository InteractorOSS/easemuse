// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { offerOutcomeInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { recordOutcome } from '@/server/offers/service';

/** Records accepted, declined (reason code), reneged (reason) or started. The position fills when openings are met. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, offerOutcomeInputSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => recordOutcome(tx, authed.actor, entryId, input), {
        userId: authed.userId,
      }),
    );
  });
}
