// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { z } from 'zod';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { authorizePortal } from '@/server/portal/authorize';
import { getMyShare } from '@/server/portal/read';

export const dynamic = 'force-dynamic';

/** One share of mine, as published. Someone else's or a revoked one is a 404. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencySlug: string; shareId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug, shareId } = await ctx.params;
    const authed = await authorizePortal(agencySlug);
    if (authed instanceof Response) return authed;
    const id = z.guid().parse(shareId);
    return ok(await withAgency(authed.agency.id, (tx) => getMyShare(tx, authed.actor, id)));
  });
}
