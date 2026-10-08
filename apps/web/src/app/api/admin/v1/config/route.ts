// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { getPlatformConfig } from '@/server/platform/config';

/** The AI routing table with prompt versions, and the feature flags that exist. Read only; any platform admin. */
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    return ok(getPlatformConfig());
  });
}
