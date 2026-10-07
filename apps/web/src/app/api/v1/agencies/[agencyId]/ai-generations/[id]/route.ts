// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { getProvenance } from '@/server/ai/provenance';

/** Provenance of one AI result: requester, model, prompt version, inputs and cost (FR-AI-03). Admin only. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; id: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, id } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => getProvenance(tx, id), { userId: authed.userId }),
    );
  });
}
