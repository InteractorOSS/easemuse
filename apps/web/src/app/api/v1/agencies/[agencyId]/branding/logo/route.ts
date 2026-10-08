// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { ApiError } from '@/lib/http/errors';
import { handleRoute, ok } from '@/lib/http/responses';
import { removeLogo, setLogo } from '@/server/branding/service';

export const dynamic = 'force-dynamic';

/** Uploads the logo as multipart `file` (PNG or JPEG, at most 512 KB). Admin only. */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const form = await req.formData().catch(() => null);
    const upload = form?.get('file');
    if (!(upload instanceof File)) {
      throw new ApiError('invalid_input', 'Attach a file', { fields: { file: 'Attach a file' } });
    }
    return ok(await setLogo(authed.actor, { bytes: new Uint8Array(await upload.arrayBuffer()) }));
  });
}

/** Removes the logo. Admin only. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(await removeLogo(authed.actor));
  });
}
