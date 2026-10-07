// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { jdTextInputSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { created, handleRoute, ok } from '@/lib/http/responses';
import { zodFields } from '@/lib/http/responses';
import {
  addPastedOriginal,
  addUploadedOriginal,
  listOriginals,
  startExtraction,
} from '@/server/positions/jd';

type Ctx = { params: Promise<{ agencyId: string; positionId: string }> };

/** The position's original JDs, newest first. Anyone who can see the position. */
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    return ok(
      await withAgency(authed.agency.id, (tx) => listOriginals(tx, authed.actor, positionId), {
        userId: authed.userId,
      }),
    );
  });
}

/**
 * Adds an original JD: multipart with a `file` (PDF, DOCX or text; read in the background), or JSON
 * `{ text }` for pasted text. Owner, lead or admin.
 */
export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const scope = { userId: authed.userId };

    if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const file = (await req.formData().catch(() => null))?.get('file');
      if (!(file instanceof File)) {
        throw new ApiError('invalid_input', 'Attach a file', { fields: { file: 'Attach a file' } });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const jd = await withAgency(
        authed.agency.id,
        (tx) => addUploadedOriginal(tx, authed.actor, positionId, { filename: file.name, bytes }),
        scope,
      );
      const jobRunId = await startExtraction(authed.actor, jd.id);
      return created({ ...jd, jobRunId });
    }

    const body = jdTextInputSchema.safeParse(await req.json().catch(() => null));
    if (!body.success)
      throw new ApiError('invalid_input', 'Invalid input', { fields: zodFields(body.error) });
    return created(
      await withAgency(
        authed.agency.id,
        (tx) => addPastedOriginal(tx, authed.actor, positionId, body.data.text),
        scope,
      ),
    );
  });
}
