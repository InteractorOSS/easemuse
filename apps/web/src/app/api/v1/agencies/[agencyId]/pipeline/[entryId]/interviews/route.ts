// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { createInterviewInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { createInterview, listInterviews } from '@/server/interviews/service';

type Ctx = { params: Promise<{ agencyId: string; entryId: string }> };

/** The interview rounds of a candidate, with the feedback recorded for each. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => listInterviews(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Adds a round. The first round of a submitted candidate moves them to "interviewing". */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, createInterviewInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => createInterview(tx, authed.actor, entryId, input),
        { userId: authed.userId },
      ),
    );
  });
}
