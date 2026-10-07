// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { agencySettingsPatchSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { readSettings, updateSettings } from '@/server/tenancy/settings';

/** Every member can read the agency's defaults (they apply to everyone's work). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(await readSettings(authed.actor));
  });
}

/** Only an admin changes them. The merged result is validated as a whole (weights add up to 100). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(await updateSettings(authed.actor, await parseBody(req, agencySettingsPatchSchema)));
  });
}
