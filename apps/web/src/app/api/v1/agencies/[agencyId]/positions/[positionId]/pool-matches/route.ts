// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway, toApiError } from '@/server/ai';
import { createVoyageClient } from '@/server/ai/voyage';
import { findInPool, getPoolMatches } from '@/server/pool/similar';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** The latest "Find in my pool" result for the position (suggestions only; null before the first run). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getPoolMatches(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}

/**
 * "Find in my pool" (US-205): up to 25 existing candidates that resemble the confirmed success
 * profile, each with a one-line reason. Runs only on this request, adds nobody to the position.
 * 409 until the success profile is confirmed.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    try {
      await findInPool(
        { embedder: createVoyageClient(), run: getGateway().run },
        authed.actor,
        positionId,
        { signal: req.signal },
      );
    } catch (error) {
      throw toApiError(error);
    }
    return ok(
      await withAgency(authed.agency.id, (tx) => getPoolMatches(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}
