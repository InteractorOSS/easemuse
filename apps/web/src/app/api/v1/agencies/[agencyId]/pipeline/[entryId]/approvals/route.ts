// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { recordApprovalInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getApprovals, recordResumeApproval } from '@/server/resume/approval';

/** The candidate's decisions on the tailored resume, and the consent for this client. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getApprovals(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Records what the candidate decided about the approved tailored resume (409 until it is approved). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, recordApprovalInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => recordResumeApproval(tx, authed.actor, entryId, input),
        { userId: authed.userId },
      ),
    );
  });
}
