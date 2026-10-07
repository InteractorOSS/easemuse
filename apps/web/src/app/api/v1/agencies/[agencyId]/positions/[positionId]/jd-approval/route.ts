// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { recordApprovalInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { recordJdApproval } from '@/server/positions/intake';

/** Records the hiring manager's decision on the approved structured JD. 409 until the JD is approved. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, recordApprovalInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => recordJdApproval(tx, authed.actor, positionId, input),
        { userId: authed.userId },
      ),
    );
  });
}
