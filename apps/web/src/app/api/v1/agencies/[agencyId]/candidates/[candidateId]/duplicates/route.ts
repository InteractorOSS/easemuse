// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { duplicatesForCandidate } from '@/server/candidates/duplicates';

/** People already in the agency who look like this candidate (email, phone, profile link, name + employer). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => duplicatesForCandidate(tx, candidateId), {
        userId: authed.userId,
      }),
    );
  });
}
