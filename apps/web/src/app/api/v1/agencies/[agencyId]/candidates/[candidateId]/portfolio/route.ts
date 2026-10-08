// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getGateway, toApiError } from '@/server/ai';
import { getPortfolio, planPortfolioCheck, runPortfolioCheck } from '@/server/pool/portfolio';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ agencyId: string; candidateId: string }> };

/** The latest "Check open positions" result for the candidate (null before the first run). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getPortfolio(tx, authed.actor, candidateId), {
        userId: authed.userId,
      }),
    );
  });
}

/**
 * "Check open positions" (US-206): Strong, Moderate or Low fit of this candidate for each open
 * position, with a reason. A suggestion for the recruiter's own review; nothing is changed.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const plan = await withAgency(
      authed.agency.id,
      (tx) => planPortfolioCheck(tx, authed.actor, candidateId),
      { userId: authed.userId },
    );
    try {
      await runPortfolioCheck(getGateway().run, authed.actor, candidateId, plan, {
        signal: req.signal,
      });
    } catch (error) {
      throw toApiError(error);
    }
    return ok(
      await withAgency(authed.agency.id, (tx) => getPortfolio(tx, authed.actor, candidateId), {
        userId: authed.userId,
      }),
    );
  });
}
