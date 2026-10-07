// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { invitePlatformAdminInputSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { invitePlatformAdmin, listPlatformAdmins } from '@/server/platform/admins';

/** Platform administrators and pending invitations. Owner only. */
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner'] });
    if (authed instanceof Response) return authed;
    return ok(await listPlatformAdmins(authed.actor));
  });
}

/** Invites a platform administrator. Owner only. The response carries the one-time link. */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner'] });
    if (authed instanceof Response) return authed;
    return created(
      await invitePlatformAdmin(authed.actor, await parseBody(req, invitePlatformAdminInputSchema)),
    );
  });
}
