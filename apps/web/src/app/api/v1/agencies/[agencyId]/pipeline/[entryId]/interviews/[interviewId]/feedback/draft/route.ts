// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getFeedbackDraft } from '@/server/interviews/feedback-draft';

/** The feedback draft of this round, or null when no email was pasted for it yet. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string; interviewId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId, interviewId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => getFeedbackDraft(tx, authed.actor, entryId, interviewId),
        { userId: authed.userId },
      ),
    );
  });
}
