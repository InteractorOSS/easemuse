// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { accepted, handleRoute, ok } from '@/lib/http/responses';
import { getReportPdfStatus, startReportPdfExport } from '@/server/submission/export';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ agencyId: string; entryId: string }> };

/** The approved report's newest PDF: `{ versionId, document: { fileId, upToDate } | null }`. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getReportPdfStatus(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Renders the approved report to PDF in the background (`202 { jobRunId }`). 409 until it is approved. */
export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { jobRunId } = await startReportPdfExport(authed.actor, entryId);
    return accepted(jobRunId);
  });
}
