// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { listTenantDeletions } from '@/server/tenant/deletion';

/** The platform's permanent record of tenant deletions: who asked, who approved, what was removed. */
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    return ok(await listTenantDeletions(authed.actor));
  });
}
