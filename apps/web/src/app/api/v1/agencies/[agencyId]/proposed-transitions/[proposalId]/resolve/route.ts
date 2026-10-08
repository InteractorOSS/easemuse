// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { resolveProposalInputSchema } from '@easemuse/core';
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { resolveProposal } from '@/server/portal/proposals';

/**
 * Accepts or declines a hiring manager's proposal. Accepting makes the move with the pipeline's rules
 * (409 `guard_failed`, 422 when a rejection needs a reason code). The entry's owner, a lead or an admin.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; proposalId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, proposalId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const id = z.guid().parse(proposalId);
    const input = await parseBody(req, resolveProposalInputSchema);
    await withAgency(authed.agency.id, (tx) => resolveProposal(tx, authed.actor, id, input), {
      userId: authed.userId,
    });
    return ok({ resolved: true });
  });
}
