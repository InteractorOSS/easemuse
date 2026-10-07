// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { intakeInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getIntake, saveIntake } from '@/server/positions/intake';

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** The intake answers and the latest recorded decision on the JD. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getIntake(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Saves the topics the recruiter filled in. Owner, lead or admin. */
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, intakeInputSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => saveIntake(tx, authed.actor, positionId, input), {
        userId: authed.userId,
      }),
    );
  });
}
