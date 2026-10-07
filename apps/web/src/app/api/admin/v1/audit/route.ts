// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseQuery } from '@/lib/http/validation';
import { auditQuerySchema, listAuditEntries } from '@/server/platform/audit-log';

/** The platform audit log: who did what to which agency, newest first. Owner, admin and support. */
export async function GET(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { items, nextCursor } = await listAuditEntries(parseQuery(req, auditQuerySchema));
    return ok(items, { nextCursor });
  });
}
