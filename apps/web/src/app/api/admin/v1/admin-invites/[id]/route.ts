// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, noContent } from '@/lib/http/responses';
import { revokePlatformAdminInvite } from '@/server/platform/admins';

/** Revokes a pending platform-admin invitation. Owner only. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner'] });
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    await revokePlatformAdminInvite(authed.actor, id);
    return noContent();
  });
}
