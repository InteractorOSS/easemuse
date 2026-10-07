// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: user
import { z } from 'zod';
import { authorizeUser } from '@/lib/auth/authorize';
import { getPlatformUser } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import { rateLimit } from '@/lib/http/rate-limit';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { acceptInvite } from '@/server/tenancy/invites';

const bodySchema = z.object({ token: z.string().min(16).max(256) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizeUser();
    if (authed instanceof Response) return authed;
    // Guessing invite tokens is the abuse case: limit per signed-in user.
    const limited = await rateLimit(
      req,
      { name: 'invite-accept', limit: 10, windowSec: 600 },
      authed.userId,
    );
    if (limited) return limited;

    const { agencySlug } = await ctx.params;
    const { token } = await parseBody(req, bodySchema);
    const user = await getPlatformUser(authed.userId);
    if (!user) throw notFound('User');
    return ok(await acceptInvite({ agencySlug, token, user }));
  });
}
