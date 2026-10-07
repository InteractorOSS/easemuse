// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { clientPatchSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getClient, updateClient } from '@/server/clients/service';

type Ctx = { params: Promise<{ agencyId: string; clientId: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, clientId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getClient(tx, clientId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Renames, archives or restores a client. */
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, clientId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const patch = await parseBody(req, clientPatchSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => updateClient(tx, authed.actor, clientId, patch), {
        userId: authed.userId,
      }),
    );
  });
}
