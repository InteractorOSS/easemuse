// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { resolveCandidateUpdateInputSchema } from '@easemuse/core';
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { resolveCandidateUpdate } from '@/server/portal/resolve-extras';

/**
 * Accepts or declines what a candidate said changed. Accepting puts it into the profile as a new
 * approved version (409 while the profile is not confirmed yet); declining changes nothing.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; candidateId: string; updateId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId, updateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const candidate = z.guid().parse(candidateId);
    const update = z.guid().parse(updateId);
    const { accept } = await parseBody(req, resolveCandidateUpdateInputSchema);
    await withAgency(
      authed.agency.id,
      (tx) => resolveCandidateUpdate(tx, authed.actor, candidate, update, accept),
      { userId: authed.userId },
    );
    return ok({ resolved: true });
  });
}
