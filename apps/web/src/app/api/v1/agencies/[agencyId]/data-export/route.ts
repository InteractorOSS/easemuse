// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { listTenantExports, requestTenantExport } from '@/server/tenant/export';

/** Admin only: the agency's data exports, newest first (FR-TEN-06). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(await listTenantExports(authed.actor));
  });
}

/** Admin only: starts a full export in the background. 202 with the export; 409 while one is being prepared. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return Response.json(
      { data: await requestTenantExport(authed.actor) },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
