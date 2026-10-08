// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { supportAccessRequestSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { listSupportGrantsForPlatform, requestSupportAccess } from '@/server/support/access';

/** Requests and grants for one agency: who asked, why, and where each stands. No agency content. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return ok(await listSupportGrantsForPlatform(id));
  });
}

/** Asks the agency's admins for a time-limited, read-only look at their workspace (FR-ADM-07). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return created(
      await requestSupportAccess(
        authed.actor,
        id,
        await parseBody(req, supportAccessRequestSchema),
      ),
    );
  });
}
