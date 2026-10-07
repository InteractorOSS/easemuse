// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway } from '@/server/ai';
import { generateReport, getReport, planReportDraft } from '@/server/submission/report';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

/**
 * Drafts sections 1 to 13 and streams them, then fact-checks. Section 14 stays empty for the
 * recruiter. Refusals (not qualified, profile not confirmed) are plain JSON errors first.
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
    await withAgency(authed.agency.id, (tx) => planReportDraft(tx, authed.actor, entryId), scope);
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      generateReport(
        { run: gateway.run, gateway, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
        stream,
      ),
    );
  });
}

/** Where the submission report stands for this candidate. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getReport(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}
