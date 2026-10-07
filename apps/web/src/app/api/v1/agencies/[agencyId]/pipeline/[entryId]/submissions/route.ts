// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { recordSubmissionInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getSubmissionOverview, recordSubmission } from '@/server/submission/submit';

type Ctx = { params: Promise<{ agencyId: string; entryId: string }> };

/** What a submission would pin now, the client's contacts, earlier submissions and the recorded ones. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getSubmissionOverview(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}

/**
 * Records the submission and moves the candidate to "submitted". 409 `guard_failed` (candidate
 * approval, consent, assessment), `pdf_missing`, `duplicate_submission`, or a changed report/resume.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, recordSubmissionInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => recordSubmission(tx, authed.actor, entryId, input),
        {
          userId: authed.userId,
        },
      ),
    );
  });
}
