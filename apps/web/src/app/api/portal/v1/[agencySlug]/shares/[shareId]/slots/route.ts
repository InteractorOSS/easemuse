// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: portal
import { z } from 'zod';
import { proposeSlotsInputSchema } from '@easemuse/core';
import { withAgency } from '@/lib/db';
import { created, handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { authorizePortal } from '@/server/portal/authorize';
import { proposeSlots } from '@/server/portal/extras';

/** The hiring manager offers up to five interview times for a submitted candidate. The recruiter confirms one. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencySlug: string; shareId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencySlug, shareId } = await ctx.params;
    const authed = await authorizePortal(agencySlug, 'hiring_manager');
    if (authed instanceof Response) return authed;
    const id = z.guid().parse(shareId);
    const input = await parseBody(req, proposeSlotsInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => proposeSlots(tx, authed.actor, id, input)),
    );
  });
}
