// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { authorizePortal } from '@/server/portal/authorize';
import { listMyShares } from '@/server/portal/read';

export const dynamic = 'force-dynamic';

/** What has been shared with me (hiring manager or candidate). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencySlug: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const authed = await authorizePortal(agencySlug);
    if (authed instanceof Response) return authed;
    return ok(await withAgency(authed.agency.id, (tx) => listMyShares(tx, authed.actor)));
  });
}
