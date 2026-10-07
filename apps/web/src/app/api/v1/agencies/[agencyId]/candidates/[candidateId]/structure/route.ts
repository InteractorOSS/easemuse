// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { accepted, handleRoute } from '@/lib/http/responses';
import { requestProfileStructure } from '@/server/candidates/intake';

export const dynamic = 'force-dynamic';

/** "Structure again" (US-202): a fresh AI profile draft for a candidate whose text was read. `202 { jobRunId }`. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return accepted(await requestProfileStructure(authed.actor, candidateId));
  });
}
