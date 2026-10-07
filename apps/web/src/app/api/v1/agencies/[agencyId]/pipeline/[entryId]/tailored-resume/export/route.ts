// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { getAgencyDefaultLocale, withAgency } from '@/lib/db';
import { accepted, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { exportResumeDocx, getResumePdfStatus, startResumePdfExport } from '@/server/resume/export';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ agencyId: string; entryId: string }> };

const exportInputSchema = z.object({ format: z.enum(['docx', 'pdf']) });

/** The approved resume's newest PDF: `{ versionId, document: { fileId, upToDate } | null }`. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getResumePdfStatus(tx, authed.actor, entryId), {
        userId: authed.userId,
      }),
    );
  });
}

/**
 * Exports the approved tailored resume: `docx` comes back as the file; `pdf` is rendered in the
 * background (`202 { jobRunId }`) and fetched with GET. 409 until the resume is approved.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { format } = await parseBody(req, exportInputSchema);
    if (format === 'pdf') {
      const { jobRunId } = await startResumePdfExport(authed.actor, entryId);
      return accepted(jobRunId);
    }
    const file = await exportResumeDocx(
      authed.actor,
      entryId,
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
