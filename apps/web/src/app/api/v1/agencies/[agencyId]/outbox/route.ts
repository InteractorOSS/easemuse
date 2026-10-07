// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { listOutbox, outboxQuerySchema } from '@/server/messaging/outbox-list';

/** The agency's outgoing mail, including the dev-capture inbox (FR-MSG-02). Admin only. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const query = parseQuery(req, outboxQuerySchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => listOutbox(tx, query), { userId: authed.userId }),
    );
  });
}
