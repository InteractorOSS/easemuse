// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { qualificationNotesInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getGateway } from '@/server/ai';
import { generateQualification, planQualification } from '@/server/qualification/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Turns rough call notes into a draft of the qualification fields; the recruiter confirms each one. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { notes } = await parseBody(req, qualificationNotesInputSchema);
    const scope = { userId: authed.userId };
    await withAgency(
      authed.agency.id,
      (tx) => planQualification(tx, authed.actor, entryId, notes),
      scope,
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      generateQualification(
        { run: gateway.run, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
        notes,
        stream,
      ),
    );
  });
}
