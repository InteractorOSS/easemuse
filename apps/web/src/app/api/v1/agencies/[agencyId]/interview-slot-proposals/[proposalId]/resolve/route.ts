// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { resolveSlotProposalInputSchema } from '@easemuse/core';
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { resolveSlotProposal } from '@/server/portal/resolve-extras';

/**
 * Confirms one of the offered interview times, which creates the round, or declines them all
 * (FR-HMP-06). The candidate's owner, a lead or an admin. 409 when the time has passed.
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
    const input = await parseBody(req, resolveSlotProposalInputSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => resolveSlotProposal(tx, authed.actor, id, input), {
        userId: authed.userId,
      }),
    );
  });
}
