// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { z } from 'zod';
import { createAgencyInputSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { getPlatformUser } from '@/lib/db';
import { pageQuerySchema } from '@/lib/http/pagination';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody, parseQuery } from '@/lib/http/validation';
import { createAgencyWithAdmin, listAgencies } from '@/server/tenancy/agencies';

const listQuery = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['trial', 'active', 'suspended', 'closed']).optional(),
});

/** Agencies: owner, admin and support may list (support is read-only). */
export async function GET(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    const { limit, cursor, q, status } = parseQuery(req, listQuery);
    const { items, nextCursor } = await listAgencies({ q, status, limit, cursor });
    return ok(items, { nextCursor });
  });
}

/** Creates an agency and invites its first admin (FR-TEN-02). Owner and admin only. */
export async function POST(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, createAgencyInputSchema);
    const user = await getPlatformUser(authed.actor.userId);
    const { agency, inviteExpiresAt } = await createAgencyWithAdmin(
      input,
      authed.actor,
      user?.name ?? user?.email ?? 'EaseMuse',
    );
    return created({ ...agency, adminEmail: input.adminEmail, inviteExpiresAt });
  });
}
