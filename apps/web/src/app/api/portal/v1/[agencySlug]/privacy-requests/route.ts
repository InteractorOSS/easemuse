// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { portalPrivacyInputSchema } from '@easemuse/core';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { requestPrivacy } from '@/server/portal/actions';
import { authorizePortal } from '@/server/portal/authorize';

/** The candidate asks for a copy of their data or for it to be deleted; the agency answers within the deadline. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const authed = await authorizePortal(agencySlug, 'candidate');
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, portalPrivacyInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => requestPrivacy(tx, authed.actor, input)),
    );
  });
}
