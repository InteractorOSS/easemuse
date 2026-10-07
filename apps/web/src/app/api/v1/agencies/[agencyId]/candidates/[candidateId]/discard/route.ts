// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, noContent } from '@/lib/http/responses';
import { discardDraft } from '@/server/candidates/service';

/** Throws a draft candidate away (409 once it is confirmed). The stored files are kept. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(authed.agency.id, (tx) => discardDraft(tx, authed.actor, candidateId), {
      userId: authed.userId,
    });
    return noContent();
  });
}
