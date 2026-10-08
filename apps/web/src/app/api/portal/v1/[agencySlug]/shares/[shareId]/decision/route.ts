// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { z } from 'zod';
import { hmDecisionInputSchema } from '@easemuse/core';
import { proposeDecision } from '@/server/portal/actions';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { authorizePortal } from '@/server/portal/authorize';

/** A hiring manager's decision on a submitted candidate: interview, hold or reject (reason). Stored as a proposal; the recruiter confirms. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string; shareId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug, shareId } = await ctx.params;
    const authed = await authorizePortal(agencySlug);
    if (authed instanceof Response) return authed;
    const id = z.guid().parse(shareId);
    const input = await parseBody(req, hmDecisionInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => proposeDecision(tx, authed.actor, id, input)),
    );
  });
}
