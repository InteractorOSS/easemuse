// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, noContent } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { setManualOrder } from '@/server/matching/dashboard';

const bodySchema = z.object({ entryIds: z.array(z.guid()).max(500) });
type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** Saves the recruiter's review order for the position. The position's owner, a lead or an admin. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { entryIds } = await parseBody(req, bodySchema);
    await withAgency(
      authed.agency.id,
      (tx) => setManualOrder(tx, authed.actor, positionId, entryIds),
      { userId: authed.userId },
    );
    return noContent();
  });
}

/** Goes back to the suggested review order. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(authed.agency.id, (tx) => setManualOrder(tx, authed.actor, positionId, []), {
      userId: authed.userId,
    });
    return noContent();
  });
}
