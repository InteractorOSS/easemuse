// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { portalConsentInputSchema } from '@easemuse/core';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { consentOverview, setConsent } from '@/server/portal/actions';
import { authorizePortal } from '@/server/portal/authorize';

type Ctx = { params: Promise<{ agencySlug: string }> };

/** The clients the candidate has been put forward to, and the consent state for each. Candidates only. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const authed = await authorizePortal(agencySlug, 'candidate');
    if (authed instanceof Response) return authed;
    return ok(await withAgency(authed.agency.id, (tx) => consentOverview(tx, authed.actor)));
  });
}

/** Gives or withdraws consent for one client (a new row each time, never an edit). */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const authed = await authorizePortal(agencySlug, 'candidate');
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, portalConsentInputSchema);
    await withAgency(authed.agency.id, (tx) => setConsent(tx, authed.actor, input));
    return created({ recorded: true });
  });
}
