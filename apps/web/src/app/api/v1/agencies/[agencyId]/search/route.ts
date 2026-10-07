// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { globalSearch } from '@/server/search/global';

/** Global search (FR-PLT-06): `?q=` finds clients, positions and candidates the person may see. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { q } = parseQuery(req, z.object({ q: z.string().trim().max(200).default('') }));
    return ok(
      await withAgency(authed.agency.id, (tx) => globalSearch(tx, authed.actor, q), {
        userId: authed.userId,
      }),
    );
  });
}
