// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { feedbackEmailInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getGateway } from '@/server/ai';
import { generateFeedbackDraft, planFeedbackDraft } from '@/server/interviews/feedback-draft';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Turns a pasted feedback email into a draft of the five ratings and comments (A17, US-903). The
 * recruiter confirms each rating before anything is recorded as feedback.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string; interviewId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId, interviewId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, feedbackEmailInputSchema);
    const scope = { userId: authed.userId };
    await withAgency(
      authed.agency.id,
      (tx) => planFeedbackDraft(tx, authed.actor, entryId, interviewId, input),
      scope,
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      generateFeedbackDraft(
        { run: gateway.run, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
        interviewId,
        input,
        stream,
      ),
    );
  });
}
