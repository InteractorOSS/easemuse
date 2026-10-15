// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { createCandidateDraft, startCandidateExtraction } from '@/server/candidates/intake';
import { parseIntakeRequest } from '@/server/candidates/intake-request';

export const dynamic = 'force-dynamic';

/**
 * Adds a candidate from a resume: multipart (`file`, `source`, optional `profileUrl`) or JSON
 * (`profileText`, `source`, optional `profileUrl`). Creates a DRAFT candidate and reads the file in the
 * background: `202 { candidateId, jobRunId }`. Any member.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;

    const { intake, file } = await parseIntakeRequest(req);

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
