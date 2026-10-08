// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { getSupportOverview } from '@/server/support/access';

/** Admin only: the support requests and grants, and every read made under a grant (FR-TEN-07). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(await getSupportOverview(authed.actor));
  });
}
