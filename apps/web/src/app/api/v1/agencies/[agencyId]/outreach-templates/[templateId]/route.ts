// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { outreachTemplateInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, noContent, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { deleteTemplate, updateTemplate } from '@/server/outreach/templates';

type Ctx = { params: Promise<{ agencyId: string; templateId: string }> };

/** Changes a template: the author's own, or a shared one for a lead or an admin. */
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, templateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, outreachTemplateInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => updateTemplate(tx, authed.actor, templateId, input),
        { userId: authed.userId },
      ),
    );
  });
}

export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, templateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(authed.agency.id, (tx) => deleteTemplate(tx, authed.actor, templateId), {
      userId: authed.userId,
    });
    return noContent();
  });
}
