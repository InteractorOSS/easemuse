// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: public
import { redeemInputSchema } from '@easemuse/core';
import { getEnv } from '@/lib/env';
import { rateLimit } from '@/lib/http/rate-limit';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { redeemMagicLink } from '@/server/portal/identity';
import { PORTAL_COOKIE, signPortalSession } from '@/server/portal/session';
import { PORTAL_SESSION_HOURS } from '@easemuse/core';

/**
 * Exchanges a magic-link token for a portal session cookie (ADR-002). Single use; the answer for an
 * unknown, foreign, used or expired token carries no hint of which agency or person it was.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string }> },
): Promise<Response> {
  const limited = await rateLimit(req, { name: 'portal-redeem', limit: 10, windowSec: 60 });
  if (limited) return limited;
  return handleRoute(async () => {
    const { agencySlug } = await ctx.params;
    const { token } = await parseBody(req, redeemInputSchema);
    const secret = getEnv().AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET is required for portal sessions');
    const who = await redeemMagicLink({ agencySlug, token });
    const response = ok({ audience: who.audience });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.headers.append(
      'Set-Cookie',
      `${PORTAL_COOKIE}=${signPortalSession(secret, who)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PORTAL_SESSION_HOURS * 3600}${secure}`,
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  });
}
