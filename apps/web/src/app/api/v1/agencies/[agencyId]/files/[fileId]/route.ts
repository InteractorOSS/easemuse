// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { getObjectStore } from '@/server/files/object-store';
import { openFileForDownload } from '@/server/files/files';

export const dynamic = 'force-dynamic';

/** Authorized file download (api-contracts §4): never a public URL, always membership-checked. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; fileId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId: ref, fileId } = await ctx.params;
    const authed = await authorizeAgency(ref);
    if (authed instanceof Response) return authed;
    const { agency, userId } = authed;

    const download = await withAgency(
      agency.id,
      async (tx) => {
        let store = null;
        try {
          store = getObjectStore();
        } catch {
          /* S3 not configured: stored-in-database originals still download */
        }
        const result = await openFileForDownload(tx, store, { agencyId: agency.id, fileId });
        await tx.activityLog.create({
          data: {
            agencyId: agency.id,
            actorType: 'user',
            actorId: userId,
            action: 'file.downloaded',
            entityType: 'file',
            entityId: fileId,
          },
        });
        return result;
      },
      { userId },
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
