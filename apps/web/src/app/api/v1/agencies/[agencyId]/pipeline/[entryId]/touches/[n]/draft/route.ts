// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { draftInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getGateway } from '@/server/ai';
import { draftTouch, planOutreachDraft } from '@/server/outreach/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const touchParam = z.coerce.number().int().min(1).max(3);

/** Writes the message for one touch and streams it. Refusals (do not contact, no profile) are plain JSON errors first. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; entryId: string; n: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, entryId, n } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const touchNumber = touchParam.parse(n);
    const { include, templateId } = await parseBody(req, draftInputSchema);
    const scope = { userId: authed.userId };
    await withAgency(
      authed.agency.id,
      (tx) => planOutreachDraft(tx, authed.actor, entryId, touchNumber, include, templateId),
      scope,
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      draftTouch(
        { run: gateway.run, withAgency: (fn) => withAgency(authed.agency.id, fn, scope) },
        authed.actor,
        entryId,
        touchNumber,
        include,
        { ...stream, ...(templateId ? { templateId } : {}) },
      ),
    );
  });
}
