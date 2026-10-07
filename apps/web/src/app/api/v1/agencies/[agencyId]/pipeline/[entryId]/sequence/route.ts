// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { sequenceInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { setSequence } from '@/server/outreach/service';

/** Plans (or re-plans) the three touches: channel and intervals. The entry's owner, a lead or an admin. */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, sequenceInputSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => setSequence(tx, authed.actor, entryId, input), {
        userId: authed.userId,
      }),
    );
  });
}
