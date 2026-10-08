// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { z } from 'zod';
import { hmFeedbackInputSchema } from '@easemuse/core';
import { giveFeedback } from '@/server/portal/actions';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { authorizePortal } from '@/server/portal/authorize';

/** Structured feedback from the hiring manager on the newest interview round. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string; shareId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug, shareId } = await ctx.params;
    const authed = await authorizePortal(agencySlug);
    if (authed instanceof Response) return authed;
    const id = z.guid().parse(shareId);
    const input = await parseBody(req, hmFeedbackInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => giveFeedback(tx, authed.actor, id, input)),
    );
  });
}
