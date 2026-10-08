// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { getAdminBilling } from '@/server/billing/service';

export const dynamic = 'force-dynamic';

/** An agency's plan, seats, usage and invoices, and the plans it could be put on. Any platform admin. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { id } = await ctx.params;
    return ok(await getAdminBilling(id));
  });
}
