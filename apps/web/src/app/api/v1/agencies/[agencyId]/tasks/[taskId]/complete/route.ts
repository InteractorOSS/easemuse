// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, noContent } from '@/lib/http/responses';
import { completeTask } from '@/server/tasks/service';

/** Marks one of your own tasks done. Someone else's task is a 404. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; taskId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, taskId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(authed.agency.id, (tx) => completeTask(tx, authed.actor, taskId), {
      userId: authed.userId,
    });
    return noContent();
  });
}
