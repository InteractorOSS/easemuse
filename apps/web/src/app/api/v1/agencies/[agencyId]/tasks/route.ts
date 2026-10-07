// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { TASK_SCOPES } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { listTasks } from '@/server/tasks/service';

const query = z.object({ scope: z.enum(TASK_SCOPES).default('today') });

/** The signed-in person's own open tasks (`?scope=today|upcoming|all`). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { scope } = parseQuery(req, query);
    return ok(
      await withAgency(authed.agency.id, (tx) => listTasks(tx, authed.actor, scope), {
        userId: authed.userId,
      }),
    );
  });
}
