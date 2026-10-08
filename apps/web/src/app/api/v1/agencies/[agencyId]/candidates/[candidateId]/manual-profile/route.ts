// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { startManualProfile } from '@/server/candidates/service';

export const dynamic = 'force-dynamic';

/**
 * "Enter the profile myself" (FR-SRC-02): a blank profile draft written by the recruiter, for when
 * the AI cannot run or is not wanted. `201 { artifactId }`, or `200` when a draft already exists.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const result = await withAgency(
      authed.agency.id,
      (tx) => startManualProfile(tx, authed.actor, candidateId),
      { userId: authed.userId },
    );
    return result.created ? created(result) : ok(result);
  });
}
