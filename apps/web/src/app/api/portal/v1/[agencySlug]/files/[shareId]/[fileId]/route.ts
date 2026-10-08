// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { z } from 'zod';
import { withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { getObjectStore } from '@/server/files/object-store';
import { authorizePortal } from '@/server/portal/authorize';
import { openMyShareFile } from '@/server/portal/read';

export const dynamic = 'force-dynamic';

/** A document of one of my shares; 404 unless that share lists the file. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencySlug: string; shareId: string; fileId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug, shareId, fileId } = await ctx.params;
    const authed = await authorizePortal(agencySlug);
    if (authed instanceof Response) return authed;
    const ids = z.object({ shareId: z.guid(), fileId: z.guid() }).parse({ shareId, fileId });
    let store = null;
    try {
      store = getObjectStore();
    } catch {
      /* object storage not configured: files kept in the database still download */
    }
    const download = await withAgency(authed.agency.id, (tx) =>
      openMyShareFile(tx, store, authed.actor, ids.shareId, ids.fileId),
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
