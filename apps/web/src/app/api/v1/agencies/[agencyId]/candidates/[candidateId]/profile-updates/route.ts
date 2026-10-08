// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { listCandidateUpdates } from '@/server/portal/resolve-extras';

/** What the candidate said changed about them (FR-CDP-04), waiting for a recruiter. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const id = z.guid().parse(candidateId);
    return ok(
      await withAgency(authed.agency.id, (tx) => listCandidateUpdates(tx, id), {
        userId: authed.userId,
      }),
    );
  });
}
