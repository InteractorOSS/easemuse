// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: user
import { authorizeUser } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { getMe } from '@/server/tenancy/me';

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizeUser();
    if (authed instanceof Response) return authed;
    return ok(await getMe(authed.userId));
  });
}
