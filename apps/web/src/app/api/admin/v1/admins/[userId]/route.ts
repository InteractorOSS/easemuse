// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { updatePlatformAdminInputSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, noContent, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { changePlatformAdminRole, removePlatformAdmin } from '@/server/platform/admins';

/** Changes a platform administrator's role. Owner only; the last owner cannot be demoted (409 `last_owner`). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ userId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner'] });
    if (authed instanceof Response) return authed;
    const { userId } = await ctx.params;
    const { role } = await parseBody(req, updatePlatformAdminInputSchema);
    return ok(await changePlatformAdminRole(authed.actor, userId, role));
  });
}

/** Removes platform access. Owner only; the last owner cannot be removed (409 `last_owner`). */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner'] });
    if (authed instanceof Response) return authed;
    const { userId } = await ctx.params;
    await removePlatformAdmin(authed.actor, userId);
    return noContent();
  });
}
