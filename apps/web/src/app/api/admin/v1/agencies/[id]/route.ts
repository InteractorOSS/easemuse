// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { getAgencyDetail } from '@/server/tenancy/agencies';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return ok(await getAgencyDetail(id));
  });
}
