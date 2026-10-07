// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { clientInputSchema, clientListFilterSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { pageQuerySchema } from '@/lib/http/pagination';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody, parseQuery } from '@/lib/http/validation';
import { createClient, listClients } from '@/server/clients/service';

type Ctx = { params: Promise<{ agencyId: string }> };

/** Clients of the agency, A to Z (`?q=`, `?includeArchived=true`). Any member. */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const query = parseQuery(req, pageQuerySchema.extend(clientListFilterSchema.shape));
    const { items, nextCursor } = await withAgency(
      authed.agency.id,
      (tx) => listClients(tx, query),
      { userId: authed.userId },
    );
    return ok(items, { nextCursor });
  });
}

/** Creates a client; `similar` lists existing clients with the same name so the UI can warn. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, clientInputSchema);
    const result = await withAgency(
      authed.agency.id,
      (tx) => createClient(tx, authed.actor, input),
      { userId: authed.userId },
    );
    return created(result);
  });
}
