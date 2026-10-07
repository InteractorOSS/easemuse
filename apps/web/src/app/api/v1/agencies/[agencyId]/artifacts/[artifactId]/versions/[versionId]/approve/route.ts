// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { approveVersionInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { approveVersion, getArtifactWithVersions } from '@/server/artifacts/service';

/**
 * Approves a draft (the only way content becomes official). 409 `factcheck_unresolved`,
 * `missing_recruiter_assessment` and `not_draft` explain a refusal.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; artifactId: string; versionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, artifactId, versionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { factCheckResolutions } = await parseBody(req, approveVersionInputSchema);
    const result = await withAgency(
      authed.agency.id,
      async (tx) => {
        await approveVersion(tx, authed.actor, versionId, {
          factCheckResolutions,
          expectedArtifactId: artifactId,
        });
        return getArtifactWithVersions(tx, artifactId);
      },
      { userId: authed.userId },
    );
    return ok(result);
  });
}
