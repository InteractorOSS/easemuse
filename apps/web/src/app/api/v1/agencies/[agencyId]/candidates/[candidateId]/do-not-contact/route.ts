// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { doNotContactInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { setDoNotContact } from '@/server/candidates/do-not-contact';

/** Sets (any member) or clears (admin only) do-not-contact. A reason is always required and logged. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, doNotContactInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => setDoNotContact(tx, authed.actor, candidateId, input),
        { userId: authed.userId },
      ),
    );
  });
}
