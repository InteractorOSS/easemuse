// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { candidateNoteInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { addNote, listNotes } from '@/server/candidates/notes';

type Ctx = { params: Promise<{ agencyId: string; candidateId: string }> };

/** The notes on one candidate, newest first. Any member. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => listNotes(tx, authed.actor, candidateId), {
        userId: authed.userId,
      }),
    );
  });
}

/** Adds a note (FR-SRC-09). Any member. */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, candidateNoteInputSchema);
    return created(
      await withAgency(authed.agency.id, (tx) => addNote(tx, authed.actor, candidateId, input), {
        userId: authed.userId,
      }),
    );
  });
}
