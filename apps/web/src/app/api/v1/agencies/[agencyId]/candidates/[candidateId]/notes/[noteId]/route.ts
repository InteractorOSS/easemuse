// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { candidateNoteInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute, noContent, ok } from '@/lib/http/responses';
import { parseBody } from '@/lib/http/validation';
import { deleteNote, updateNote } from '@/server/candidates/notes';

type Ctx = { params: Promise<{ agencyId: string; candidateId: string; noteId: string }> };

/** Changes a note; only its author (403 otherwise). */
export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId, noteId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const input = await parseBody(req, candidateNoteInputSchema);
    return ok(
      await withAgency(
        authed.agency.id,
        (tx) => updateNote(tx, authed.actor, candidateId, noteId, input),
        { userId: authed.userId },
      ),
    );
  });
}

/** Deletes a note; its author or an admin. */
export async function DELETE(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, candidateId, noteId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    await withAgency(authed.agency.id, (tx) => deleteNote(tx, authed.actor, candidateId, noteId), {
      userId: authed.userId,
    });
    return noContent();
  });
}
