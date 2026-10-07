// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { z } from 'zod';
import { guardOverrideSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { streamAiRun } from '@/lib/http/ai-stream';
import { handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { getGateway } from '@/server/ai';
import {
  getSuccessProfileArtifact,
  planSuccessProfile,
  runSuccessProfile,
} from '@/server/positions/success-profile';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };
const bodySchema = z.object({ overrideGuards: z.array(guardOverrideSchema).max(8).optional() });

/** Where the success profile lives (null before the first draft). */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => getSuccessProfileArtifact(tx, authed.actor, positionId),
        { userId: authed.userId },
      ),
    );
  });
}

/**
 * Writes the Candidate Success Profile with A5 (streamed). 409 until the structured JD is approved
 * and the intake has answers; 409 `guard_failed` while the hiring manager has not approved the JD.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const text = await req.text();
    const { overrideGuards } = text
      ? await parseBody(new Request(req.url, { method: 'POST', body: text }), bodySchema)
      : { overrideGuards: undefined };
    const plan = await withAgency(
      authed.agency.id,
      (tx) => planSuccessProfile(tx, authed.actor, positionId, overrideGuards),
      { userId: authed.userId },
    );
    const gateway = getGateway();
    return streamAiRun(req, (stream) =>
      runSuccessProfile(gateway.run, authed.actor, positionId, plan, stream),
    );
  });
}
