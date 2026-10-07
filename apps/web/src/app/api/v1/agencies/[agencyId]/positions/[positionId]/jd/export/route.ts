// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { getAgencyDefaultLocale, withAgency } from '@/lib/db';
import { accepted, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import {
  exportDocx,
  exportInputSchema,
  getPdfStatus,
  startPdfExport,
} from '@/server/positions/jd-export';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** The approved JD's newest PDF: `{ versionId, document: { fileId, upToDate } | null }`. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getPdfStatus(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}

/**
 * Exports the approved structured JD (US-105): `docx` comes back as the file; `pdf` is rendered in
 * the background (`202 { jobRunId }`) and fetched with GET. 409 until the JD is approved.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { format } = await parseBody(req, exportInputSchema);
    if (format === 'pdf') {
      const { jobRunId } = await startPdfExport(authed.actor, positionId);
      return accepted(jobRunId);
    }
    const file = await exportDocx(
      authed.actor,
      positionId,
      await getAgencyDefaultLocale(authed.agency.id),
    );
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
