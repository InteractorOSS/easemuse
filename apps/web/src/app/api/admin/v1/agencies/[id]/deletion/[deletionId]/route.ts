// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { cancelTenantDeletion } from '@/server/tenant/deletion';

/** Stops a deletion that has not started running. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; deletionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id, deletionId } = await ctx.params;
    return ok(await cancelTenantDeletion(authed.actor, id, deletionId));
  });
}
