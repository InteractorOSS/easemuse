// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { handleRoute } from '@/lib/http/responses';
import { createCandidateDraft, startCandidateExtraction } from '@/server/candidates/intake';
import { parseIntakeRequest } from '@/server/candidates/intake-request';
import { requirePosition } from '@/server/positions/service';

export const dynamic = 'force-dynamic';

/**
 * Adds a candidate from a position by pasting a LinkedIn profile or uploading a LinkedIn PDF export:
 * multipart (`file`, optional `profileUrl`) or JSON (`profileText`, optional `profileUrl`). The source
 * is always LinkedIn. The link is stored as text and never fetched (brief 4.1). Creates a DRAFT
 * candidate and reads it in the background: `202 { candidateId, jobRunId, positionId }`. The
 * recruiter confirms the profile and adds the candidate to the position in a later step. Any member
 * who can see the position.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ agencyId: string; positionId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, positionId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;

    const { intake, file } = await parseIntakeRequest(req, 'linkedin');
    const draft = await withAgency(
      authed.agency.id,
      async (tx) => {
        await requirePosition(tx, authed.actor, positionId, 'read');
        return createCandidateDraft(tx, authed.actor, intake, file);
      },
      { userId: authed.userId },
    );
    const jobRunId = await startCandidateExtraction(authed.actor, draft.documentId);
    return Response.json(
      { data: { candidateId: draft.candidateId, jobRunId, positionId } },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  });
}
