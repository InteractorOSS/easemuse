// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { contactPatchSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, noContent, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { removeContact, updateContact } from '@/server/clients/service';

type Ctx = { params: Promise<{ agencyId: string; clientId: string; contactId: string }> };

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, clientId, contactId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const patch = await parseBody(req, contactPatchSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => updateContact(tx, clientId, contactId, patch), {
        userId: authed.userId,
      }),
    );
  });
}

/** 409 while the contact is a position's hiring manager or has portal access. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, clientId, contactId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(
      authed.agency.id,
      (tx) => removeContact(tx, authed.actor, clientId, contactId),
      { userId: authed.userId },
    );
    return noContent();
  });
}
