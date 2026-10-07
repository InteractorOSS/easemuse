// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import { analyzeEntry, planMatchAnalysis } from '@/server/matching/analyze';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * Analyzes one candidate and streams the draft as it is written (US-302). Permission and the
 * approved-profile checks happen first, so those refusals are plain JSON errors (403, 404, 409).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const scope = { userId: authed.userId };
    await withAgency(authed.agency.id, (tx) => planMatchAnalysis(tx, authed.actor, entryId), scope);
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      analyzeEntry(
        { run: gateway.run, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
        stream,
      ),
    );
  });
}
