// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { recruiterAssessmentInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { saveAssessment } from '@/server/matching/overrides';

/** Saves the recruiter's own assessment (FR-MAT-05). Written by a person only; the entry's owner, a lead or an admin. */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; analysisId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, analysisId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, recruiterAssessmentInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => saveAssessment(tx, authed.actor, analysisId, input),
        { userId: authed.userId },
      ),
    );
  });
}
