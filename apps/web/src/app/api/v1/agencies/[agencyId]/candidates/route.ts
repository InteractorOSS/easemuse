// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { candidateSearchQuerySchema, confirmCandidateInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { pageQuerySchema } from '@/lib/http/pagination';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody, parseQuery } from '@/lib/http/validation';
import { confirmCandidate } from '@/server/candidates/confirm';
import { searchCandidates } from '@/server/candidates/search';

/**
 * Confirms a draft candidate (US-202, US-203). 409 `possible_duplicate` when someone already in the
 * database looks the same and no `resolution` (`create` with a reason, `merge` or `link` with a
 * `targetId`) was chosen.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, confirmCandidateInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => confirmCandidate(tx, authed.actor, input), {
        userId: authed.userId,
      }),
    );
  });
}

/**
 * Talent pool search (US-207): `?q=` text plus `skills`, `location`, `seniority`, `tags`, `minYears`,
 * `maxYears`. Best match first with text, newest first without. Active candidates only. Any member.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const parsed = parseQuery(req, pageQuerySchema.extend(candidateSearchQuerySchema.shape));
    const { limit, cursor, ...filters } = parsed;
    const { items, nextCursor } = await withAgency(
      authed.agency.id,
      (tx) => searchCandidates(tx, filters, { limit, cursor }),
      { userId: authed.userId },
    );
    return ok(items, { nextCursor });
  });
}
