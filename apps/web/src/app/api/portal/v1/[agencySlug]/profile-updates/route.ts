// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { candidateUpdateInputSchema } from '@easemuse/core';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { authorizePortal } from '@/server/portal/authorize';
import { listMyUpdates, proposeCandidateUpdate } from '@/server/portal/extras';

type Ctx = { params: Promise<{ agencySlug: string }> };

/** The candidate's own updates and whether the recruiter has answered each. Candidates only. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const authed = await authorizePortal(agencySlug, 'candidate');
    if (authed instanceof Response) return authed;
    return ok(await withAgency(authed.agency.id, (tx) => listMyUpdates(tx, authed.actor)));
  });
}

/** The candidate says what changed (contact details, availability, compensation, work authorization). A proposal until a recruiter accepts. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const authed = await authorizePortal(agencySlug, 'candidate');
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, candidateUpdateInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => proposeCandidateUpdate(tx, authed.actor, input)),
    );
  });
}
