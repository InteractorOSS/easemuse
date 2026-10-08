// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { endSupportAccess } from '@/server/support/access';

/** The administrator withdraws their own request or ends their own access early. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; grantId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { id, grantId } = await ctx.params;
    return ok(await endSupportAccess(authed.actor, id, grantId));
  });
}
