// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { createPrivacyRequestInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { createPrivacyRequest, listPrivacyRequests } from '@/server/privacy/service';

type Ctx = { params: Promise<{ agencyId: string }> };

/** Candidate data-rights requests with their deadlines. Leads and admins. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin', 'lead'] });
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => listPrivacyRequests(tx, authed.actor), {
        userId: authed.userId,
      }),
    );
  });
}

/** Records a request received from a candidate (export or deletion) and starts its deadline. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin', 'lead'] });
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, createPrivacyRequestInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => createPrivacyRequest(tx, authed.actor, input), {
        userId: authed.userId,
      }),
    );
  });
}
