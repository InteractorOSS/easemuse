// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: admin
import { newAgencyDefaultsSchema } from '@easemuse/core';
import { authorizePlatformAdmin } from '@/lib/auth/authorize';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getNewAgencyDefaultsView, patchNewAgencyDefaults } from '@/server/platform/config';

/** The settings a new agency starts from, with every default filled in. Any platform admin. */
export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin();
    if (authed instanceof Response) return authed;
    return ok(await getNewAgencyDefaultsView(authed.actor));
  });
}

/** Changes them (owner or admin). Agencies that already exist keep their own settings. Logged. */
export async function PATCH(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizePlatformAdmin({ roles: ['owner', 'admin'] });
    if (authed instanceof Response) return authed;
    return ok(
      await patchNewAgencyDefaults(authed.actor, await parseBody(req, newAgencyDefaultsSchema)),
    );
  });
}
