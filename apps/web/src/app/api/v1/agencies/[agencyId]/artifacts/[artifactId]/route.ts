// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getArtifactWithVersions } from '@/server/artifacts/service';

/** Review surface: the artifact with every version (AI original and each edit), newest first. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; artifactId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, artifactId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getArtifactWithVersions(tx, artifactId), {
        userId: authed.userId,
      }),
    );
  });
}
