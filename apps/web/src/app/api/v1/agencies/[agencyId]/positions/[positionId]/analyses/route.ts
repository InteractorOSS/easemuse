// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { batchAnalysisInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { startBatchAnalysis } from '@/server/matching/batch';

export const dynamic = 'force-dynamic';

/**
 * Analyzes 1 to 50 candidates of the position in the background (US-302): `202 { jobRunId, total }`,
 * with progress on `job:<jobRunId>`. The whole request is refused (403, 404 or 422) if any candidate
 * is not one the person may analyze in this position.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, batchAnalysisInputSchema);
    const started = await startBatchAnalysis(authed.actor, positionId, input);
    return Response.json(
      { data: started },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
