// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { openFileForDownload } from '@/server/files/files';
import { getObjectStore } from '@/server/files/object-store';
import { getCompletedExportFile } from '@/server/tenant/export';

export const dynamic = 'force-dynamic';

/** Admin only: downloads a finished export. The download is logged in the agency's activity log. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; exportId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, exportId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const download = await withAgency(
      authed.agency.id,
      async (tx) => {
        const { fileId } = await getCompletedExportFile(tx, authed.actor, exportId);
        let store = null;
        try {
          store = getObjectStore();
        } catch {
          /* S3 not configured: exports kept in the database still download */
        }
        return openFileForDownload(tx, store, { agencyId: authed.agency.id, fileId });
      },
      { userId: authed.userId },
    );
    if (download.kind === 'redirect') {
      return new Response(null, {
        status: 302,
        headers: { Location: download.url, 'Cache-Control': 'no-store' },
      });
    }
    return new Response(new Uint8Array(download.bytes), {
      headers: {
        'Content-Type': download.contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(download.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
