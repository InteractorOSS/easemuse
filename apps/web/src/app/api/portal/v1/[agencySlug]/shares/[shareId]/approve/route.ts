// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { z } from 'zod';
import { portalDecisionInputSchema } from '@easemuse/core';
import { decideShare } from '@/server/portal/actions';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { authorizePortal } from '@/server/portal/authorize';

/** Approves what was shared: the JD (hiring manager) or the tailored resume (candidate). 409 `stale_share` when a newer version exists. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string; shareId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug, shareId } = await ctx.params;
    const authed = await authorizePortal(agencySlug);
    if (authed instanceof Response) return authed;
    const id = z.guid().parse(shareId);
    const input = await parseBody(req, portalDecisionInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) =>
        decideShare(tx, authed.actor, id, 'approved', input),
      ),
    );
  });
}
