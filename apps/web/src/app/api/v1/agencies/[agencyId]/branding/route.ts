// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { agencyBrandingPatchSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { readBranding, updateBranding } from '@/server/branding/service';

/** Every member sees the agency's name, colour and logo (FR-TEN-04). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(await readBranding(authed.actor));
  });
}

/** Only an admin changes the display name and colour. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(await updateBranding(authed.actor, await parseBody(req, agencyBrandingPatchSchema)));
  });
}
