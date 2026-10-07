// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { contactInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { addContact } from '@/server/clients/service';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; clientId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, clientId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, contactInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => addContact(tx, authed.actor, clientId, input), {
        userId: authed.userId,
      }),
    );
  });
}
