// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { createBlankQualification } from '@/server/qualification/service';

/** Starts an empty qualification record to fill in by hand. The entry's owner, a lead or an admin. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => createBlankQualification(tx, authed.actor, entryId),
        {
          userId: authed.userId,
        },
      ),
    );
  });
}
