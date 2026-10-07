// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: user
import { z } from 'zod';
import { authorizeUser } from '@/lib/auth/authorize';
import { LOCALES } from '@/i18n/config';
import { parseBody } from '@/lib/http/validation';
import { handleRoute, ok } from '@/lib/http/responses';
import { getMe, updateMyLocale } from '@/server/tenancy/me';

const patchSchema = z.object({ locale: z.enum(LOCALES).nullable() });

export async function GET(): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizeUser();
    if (authed instanceof Response) return authed;
    return ok(await getMe(authed.userId));
  });
}

export async function PATCH(req: Request): Promise<Response> {
  return handleRoute(async () => {
    const authed = await authorizeUser();
    if (authed instanceof Response) return authed;
    const { locale } = await parseBody(req, patchSchema);
    return ok(await updateMyLocale(authed.userId, locale));
  });
}
