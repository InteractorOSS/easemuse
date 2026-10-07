// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { recordFeedbackInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { recordFeedback } from '@/server/interviews/service';

/** Records the hiring manager's or the candidate's feedback on a round. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string; interviewId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId, interviewId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, recordFeedbackInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => recordFeedback(tx, authed.actor, entryId, interviewId, input),
        {
          userId: authed.userId,
        },
      ),
    );
  });
}
