// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { listOpenProposals } from '@/server/portal/proposals';

/** Hiring-manager decisions waiting for the recruiter (a recruiter sees their own candidates'). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => listOpenProposals(tx, authed.actor), {
        userId: authed.userId,
      }),
    );
  });
}
