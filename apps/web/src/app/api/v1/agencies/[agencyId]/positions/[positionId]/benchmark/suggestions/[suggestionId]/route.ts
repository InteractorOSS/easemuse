// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { decideSuggestion } from '@/server/benchmark/service';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** The approved benchmark version the suggestion belongs to. */
  versionId: z.guid(),
  decision: z.enum(['accepted', 'rejected']),
});

/**
 * Accepts or rejects ONE suggested change of an approved benchmark. Accepting writes the change into
 * a new draft of the structured JD (which still needs its own approval). 409 until the benchmark is
 * approved, when the JD has not been structured, or when the suggestion was decided before.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string; suggestionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId, suggestionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const body = await parseBody(req, bodySchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => decideSuggestion(tx, authed.actor, { positionId, suggestionId, ...body }),
        { userId: authed.userId },
      ),
    );
  });
}
