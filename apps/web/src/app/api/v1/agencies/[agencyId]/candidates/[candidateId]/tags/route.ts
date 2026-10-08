// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { candidateTagsInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { setTags } from '@/server/candidates/notes';

/** Replaces the candidate's tags (FR-SRC-09). Any member. */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, candidateTagsInputSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => setTags(tx, authed.actor, candidateId, input), {
        userId: authed.userId,
      }),
    );
  });
}
