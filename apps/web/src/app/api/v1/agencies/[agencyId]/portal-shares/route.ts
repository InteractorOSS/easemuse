// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { listSharesQuerySchema, publishShareInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody, parseQuery } from '@/lib/http/validation';
import { listSharesFor, publishShare } from '@/server/portal/publish';

/**
 * Shares an approved item with one portal user: the JD for the hiring manager's approval, a
 * submission (recorded by "portal" when not yet recorded), or the tailored resume for the candidate.
 * A new share replaces the earlier one for that person.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, publishShareInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => publishShare(tx, authed.actor, input), {
        userId: authed.userId,
      }),
    );
  });
}

/** What has been shared about one item (`?kind=&subjectId=`), newest first. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { kind, subjectId } = parseQuery(req, listSharesQuerySchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => listSharesFor(tx, kind, subjectId), {
        userId: authed.userId,
      }),
    );
  });
}
