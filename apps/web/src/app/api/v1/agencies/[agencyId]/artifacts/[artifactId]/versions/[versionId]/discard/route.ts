// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { discardVersion } from '@/server/artifacts/service';

/** Discards a draft version. Approved versions cannot be discarded (409 `not_draft`). */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; artifactId: string; versionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, artifactId, versionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => discardVersion(tx, authed.actor, versionId, { expectedArtifactId: artifactId }),
        {
          userId: authed.userId,
        },
      ),
    );
  });
}
