// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { importRequestSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { importCandidateRows } from '@/server/candidates/import-csv';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Imports one batch (up to 100 rows) of a CSV the page has mapped (T-2-15). Any member. Returns what
 * happened to each row: created, skipped as a duplicate of someone already in the agency, or invalid.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, importRequestSchema);
    return ok(
      await withAgency(authed.agency.id, (tx) => importCandidateRows(tx, authed.actor, input), {
        userId: authed.userId,
      }),
    );
  });
}
