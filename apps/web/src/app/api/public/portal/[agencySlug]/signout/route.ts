// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: public
import { rateLimit } from '@/lib/http/rate-limit';
import { handleRoute, ok } from '@/lib/http/responses';
import { PORTAL_COOKIE } from '@/server/portal/session';

/** Ends the portal session in this browser by expiring the cookie. */
export async function POST(req: Request): Promise<Response> {
  const limited = await rateLimit(req, { name: 'portal-signout', limit: 30, windowSec: 60 });
  if (limited) return limited;
  return handleRoute(async () => {
    const response = ok({ signedOut: true });
    response.headers.append(
      'Set-Cookie',
      `${PORTAL_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  });
}
