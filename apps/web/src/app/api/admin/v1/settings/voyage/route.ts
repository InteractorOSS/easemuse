// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { z } from 'zod';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { clearVoyageKey, getVoyageKeyStatus, setVoyageKey } from '@/server/platform/secrets';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ apiKey: z.string().trim().min(10).max(300) });

/** Whether a Voyage key is in use and where it comes from; only the last four characters are shown. Any platform admin. */
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    return ok(await getVoyageKeyStatus(authed.actor));
  });
}

/** Stores the key, encrypted. Owner only; 422 when it does not look like a Voyage key. */
export async function PUT(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner'] });
    if (authed instanceof Response) return authed;
    const { apiKey } = await parseBody(req, bodySchema);
    return ok(await setVoyageKey(authed.actor, apiKey));
  });
}

/** Removes the stored key; the environment key, if any, is used again. Owner only. */
export async function DELETE(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner'] });
    if (authed instanceof Response) return authed;
    return ok(await clearVoyageKey(authed.actor));
  });
}
