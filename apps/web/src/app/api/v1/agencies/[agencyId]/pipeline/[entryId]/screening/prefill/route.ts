// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import {
  generateScreeningPrefill,
  getScreeningPrefill,
  planScreeningPrefill,
} from '@/server/screening/prefill';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ agencyId: string; entryId: string }> };

/** Suggests ratings and notes for the screening checklist from the confirmed profile (a draft; the recruiter decides). */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const scope = { userId: authed.userId };
    await withAgency(
      authed.agency.id,
      (tx) => planScreeningPrefill(tx, authed.actor, entryId),
      scope,
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      generateScreeningPrefill(
        { run: gateway.run, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
        stream,
      ),
    );
  });
}

/** The newest suggestions, or null. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getScreeningPrefill(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}
