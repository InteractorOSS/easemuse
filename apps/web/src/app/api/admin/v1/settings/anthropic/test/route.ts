// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { rateLimit } from '@/lib/http/rate-limit';
import { handleRoute, ok } from '@/lib/http/responses';
import { checkAnthropicKey } from '@/server/ai/key-check';

export const dynamic = 'force-dynamic';

/** Checks that the key in use works and has credit (one-token call). Owner or admin. */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const limited = await rateLimit(
      req,
      { name: 'anthropic-key-test', limit: 6, windowSec: 60 },
      authed.actor.userId,
    );
    if (limited) return limited;
    return ok(await checkAnthropicKey());
  });
}
