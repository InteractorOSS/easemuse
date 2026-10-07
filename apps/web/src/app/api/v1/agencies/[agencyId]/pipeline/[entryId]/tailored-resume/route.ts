// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { tailorInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getGateway } from '@/server/ai';
import {
  generateTailoredResume,
  getTailoredResume,
  planTailoredResume,
} from '@/server/resume/tailor';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * Writes the tailored resume and streams it, then fact-checks it. Refusals (not qualified, profile
 * not confirmed) are plain JSON errors first.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { blind } = await parseBody(req, tailorInputSchema);
    const scope = { userId: authed.userId };
    await withAgency(
      authed.agency.id,
      (tx) => planTailoredResume(tx, authed.actor, entryId, blind),
      scope,
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      generateTailoredResume(
        { run: gateway.run, gateway, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
        blind,
        stream,
      ),
    );
  });
}

/** Where the tailored resume stands for this candidate. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getTailoredResume(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}
