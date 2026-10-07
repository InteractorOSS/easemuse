// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { pageQuerySchema } from '@/lib/http/pagination';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { listMembers } from '@/server/tenancy/members';

/** Members list: admin and lead (api-contracts §1). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin', 'lead'] });
    if (authed instanceof Response) return authed;
    const { limit, cursor } = parseQuery(req, pageQuerySchema);
    const { items, nextCursor } = await listMembers(authed.actor, { limit, cursor });
    return ok(items, { nextCursor });
  });
}
