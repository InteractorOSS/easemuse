// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { setFeatureFlagInputSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getAgencyFeatures, setAgencyFeature } from '@/server/platform/config';

/** The agency's feature flags. Any platform admin. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return ok(await getAgencyFeatures(id));
  });
}

/** Switches one flag (owner or admin). Logged in the platform audit log and in the agency's activity log. */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return ok(
      await setAgencyFeature(authed.actor, id, await parseBody(req, setFeatureFlagInputSchema)),
    );
  });
}
