// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { tenantDeletionConfirmSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getLatestTenantDeletion, requestTenantDeletion } from '@/server/tenant/deletion';

/** The newest deletion record of this agency (still readable after the agency is gone, by its id). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return ok(await getLatestTenantDeletion(authed.actor, id));
  });
}

/** An owner or admin asks for the agency to be deleted, typing its URL name. It must be suspended first. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return created(
      await requestTenantDeletion(
        authed.actor,
        id,
        await parseBody(req, tenantDeletionConfirmSchema),
      ),
    );
  });
}
