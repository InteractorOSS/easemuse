// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { getSystemHealth, healthQuerySchema } from '@/server/platform/health';

export const dynamic = 'force-dynamic';

/** Queues and failed jobs, outbox failures and AI error and refusal rates per agency: counts and ids only (FR-ADM-09). */
export async function GET(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    return ok(await getSystemHealth(parseQuery(req, healthQuerySchema)));
  });
}
