// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { tenantDeletionConfirmSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { approveTenantDeletion } from '@/server/tenant/deletion';

/** A different owner or admin approves, typing the URL name again. The deletion starts in the background. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; deletionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const { id, deletionId } = await ctx.params;
    return ok(
      await approveTenantDeletion(
        authed.actor,
        id,
        deletionId,
        await parseBody(req, tenantDeletionConfirmSchema),
      ),
    );
  });
}
