// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { rejectPrivacyRequestInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { rejectPrivacyRequest } from '@/server/privacy/service';

/** Declines a request, with the reason kept. Admin only. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; requestId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, requestId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const { reason } = await parseBody(req, rejectPrivacyRequestInputSchema);
    await withAgency(
      authed.agency.id,
      (tx) => rejectPrivacyRequest(tx, authed.actor, requestId, reason),
      {
        userId: authed.userId,
      },
    );
    return ok({ rejected: true });
  });
}
