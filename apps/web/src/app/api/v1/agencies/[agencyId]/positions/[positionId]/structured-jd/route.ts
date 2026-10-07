// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getStructuredJdArtifact, listRequirements } from '@/server/positions/structured-jd';

/** The structured JD's artifact id (null before the first draft) and the approved requirements. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        async (tx) => ({
          ...(await getStructuredJdArtifact(tx, authed.actor, positionId)),
          requirements: await listRequirements(tx, authed.actor, positionId),
        }),
        { userId: authed.userId },
      ),
    );
  });
}
