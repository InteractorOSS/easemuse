// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import { recheckTailoredResume } from '@/server/resume/tailor';

export const maxDuration = 120;

/** Checks the facts of the newest draft again, after edits. The entry's owner, a lead or an admin. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const scope = { userId: authed.userId };
    const gateway = getGateway();
    return ok(
      await recheckTailoredResume(
        { gateway, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
      ),
    );
  });
}
