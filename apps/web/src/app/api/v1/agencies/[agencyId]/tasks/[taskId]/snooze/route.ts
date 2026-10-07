// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { snoozeTaskInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, noContent } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { snoozeTask } from '@/server/tasks/service';

/** Hides one of your own tasks until a later time (at most 30 days ahead). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; taskId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, taskId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { until } = await parseBody(req, snoozeTaskInputSchema);
    await withAgency(authed.agency.id, (tx) => snoozeTask(tx, authed.actor, taskId, until), {
      userId: authed.userId,
    });
    return noContent();
  });
}
