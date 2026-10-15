// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { candidateIntakeSchema, candidateIntakeTextSchema } from '@easemuse/core';
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { handleRoute, zodFields } from '@/lib/http/responses';
import {
  createCandidateDraft,
  startCandidateExtraction,
  type IntakeFile,
} from '@/server/candidates/intake';

export const dynamic = 'force-dynamic';

/**
 * Adds a candidate from a resume: multipart (`file`, `source`, optional `profileUrl`, `positionId`) or
 * JSON (`profileText`, `source`, optional `profileUrl`, `positionId`). Creates a DRAFT candidate and
 * reads the file in the background: `202 { candidateId, jobRunId }`. Any member who can see the
 * position, when one is given (G#9).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;

    let intake;
    let file: IntakeFile;
    if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const form = await req.formData().catch(() => null);
      const upload = form?.get('file');
      if (!(upload instanceof File)) {
        throw new ApiError('invalid_input', 'Attach a file', { fields: { file: 'Attach a file' } });
      }
      const parsed = candidateIntakeSchema.safeParse({
        source: form?.get('source') ?? undefined,
        profileUrl: form?.get('profileUrl')?.toString() || undefined,
        positionId: form?.get('positionId')?.toString() || undefined,
      });
      if (!parsed.success)
        throw new ApiError('invalid_input', 'Invalid input', { fields: zodFields(parsed.error) });
      intake = parsed.data;
      file = {
        filename: upload.name,
        bytes: new Uint8Array(await upload.arrayBuffer()),
        kind: 'resume',
      };
    } else {
      const parsed = candidateIntakeTextSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success)
        throw new ApiError('invalid_input', 'Invalid input', { fields: zodFields(parsed.error) });
      intake = parsed.data;
      file = {
        filename: 'profile.txt',
        bytes: new TextEncoder().encode(parsed.data.profileText),
        kind: 'profile_text',
      };
    }

    const draft = await withAgency(
      authed.agency.id,
      (tx) => createCandidateDraft(tx, authed.actor, intake, file),
      { userId: authed.userId },
    );
    const jobRunId = await startCandidateExtraction(authed.actor, draft.documentId);
    return Response.json(
      { data: { candidateId: draft.candidateId, jobRunId } },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
