// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { updateInterviewInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { updateInterview } from '@/server/interviews/service';

/** Changes a round: time, people, format or status (scheduled, completed, cancelled, no-show). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string; interviewId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId, interviewId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, updateInterviewInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => updateInterview(tx, authed.actor, entryId, interviewId, input),
        {
          userId: authed.userId,
        },
      ),
    );
  });
}
