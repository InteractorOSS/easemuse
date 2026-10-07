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
import { acceptPlatformAdminInvite } from '@/server/platform/admins';

const bodySchema = z.object({ token: z.string().min(16).max(256) });

/** A signed-in person accepts a platform-admin invitation sent to their email address. */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizeUser();
    if (authed instanceof Response) return authed;
    const limited = await rateLimit(
      req,
      { name: 'platform-invite-accept', limit: 10, windowSec: 600 },
      authed.userId,
    );
    if (limited) return limited;
    const { token } = await parseBody(req, bodySchema);
    const user = await getPlatformUser(authed.userId);
    if (!user) throw notFound('User');
    return ok(await acceptPlatformAdminInvite({ token, user }));
  });
}
