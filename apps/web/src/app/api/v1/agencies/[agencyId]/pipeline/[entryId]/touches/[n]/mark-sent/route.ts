// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { sendInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { markTouchSentByHand } from '@/server/outreach/service';

const touchParam = z.coerce.number().int().min(1).max(3);

/** Marks a LinkedIn, text or phone touch as sent after the recruiter sent it themselves. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string; n: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId, n } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const { versionId } = await parseBody(req, sendInputSchema);
    const touchNumber = touchParam.parse(n);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => markTouchSentByHand(tx, authed.actor, entryId, touchNumber, versionId),
        { userId: authed.userId },
      ),
    );
  });
}
