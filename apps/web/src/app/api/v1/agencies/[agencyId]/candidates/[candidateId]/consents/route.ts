// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { recordConsentInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { listConsents, recordConsent } from '@/server/resume/approval';

/** Every consent row of the candidate, newest first. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => listConsents(tx, candidateId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Appends a consent row (given or withdrawn) for one client. Rows are never edited. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, recordConsentInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => recordConsent(tx, authed.actor, candidateId, input),
        { userId: authed.userId },
      ),
    );
  });
}
