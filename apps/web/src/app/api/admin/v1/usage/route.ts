// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { getPlatformUsage, usageQuerySchema } from '@/server/platform/usage';

/** AI cost and tokens by agency, purpose, model or day. Owner, admin and support (read-only). */
export async function GET(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    return ok(await getPlatformUsage(parseQuery(req, usageQuerySchema)));
  });
}
