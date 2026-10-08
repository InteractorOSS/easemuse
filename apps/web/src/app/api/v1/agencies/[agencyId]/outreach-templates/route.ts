// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { outreachTemplateInputSchema, outreachTemplateListQuerySchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody, parseQuery } from '@/lib/http/validation';
import { createTemplate, listTemplates } from '@/server/outreach/templates';

type Ctx = { params: Promise<{ agencyId: string }> };

/**
 * The templates the person can use: their own and the agency's shared ones; with `?entryId=` only
 * those that fit that candidate's client. Any member.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const query = parseQuery(req, outreachTemplateListQuerySchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => listTemplates(tx, authed.actor, query), {
        userId: authed.userId,
      }),
    );
  });
}

/** Creates a template; sharing it with the agency needs a lead or an admin (403 otherwise). */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, outreachTemplateInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => createTemplate(tx, authed.actor, input), {
        userId: authed.userId,
      }),
    );
  });
}
