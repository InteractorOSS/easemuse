// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { saveVersionInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { saveEditToLatest } from '@/server/artifacts/service';

/** Saves a recruiter's edit as a new version; content is validated by the kind's schema (422). */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; artifactId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, artifactId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { content } = await parseBody(req, saveVersionInputSchema);
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => saveEditToLatest(tx, authed.actor, artifactId, content),
        { userId: authed.userId },
      ),
    );
  });
}
