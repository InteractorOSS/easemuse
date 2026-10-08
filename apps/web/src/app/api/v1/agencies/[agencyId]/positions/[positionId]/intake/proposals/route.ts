// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { resolveIntakeProposalInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { resolveIntakeProposal } from '@/server/positions/intake';

/**
 * Accepts or declines the hiring manager's answer to one intake topic (FR-HMP-03). Accepting
 * records it as "from the hiring manager" and replaces the topic's answer. The position's owner,
 * a lead or an admin.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, resolveIntakeProposalInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => resolveIntakeProposal(tx, authed.actor, positionId, input),
        { userId: authed.userId },
      ),
    );
  });
}
