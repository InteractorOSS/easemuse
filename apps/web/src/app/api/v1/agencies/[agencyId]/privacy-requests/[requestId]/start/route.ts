// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { withAgency } from '@/lib/db';
import { accepted, handleRoute } from '@/lib/http/responses';
import { enqueue } from '@/lib/queue';
import { attachJob, beginPrivacyRequest } from '@/server/privacy/service';

/**
 * Carries out the request in the background: the export builds a ZIP, the deletion removes the
 * candidate's personal data. Admin only; 409 when it was already started or closed.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; requestId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, requestId } = await ctx.params;
    const authed = await authorizeAgency(agencyId, { roles: ['admin'] });
    if (authed instanceof Response) return authed;
    const scope = { userId: authed.userId };
    const { kind } = await withAgency(
      authed.agency.id,
      (tx) => beginPrivacyRequest(tx, authed.actor, requestId),
      scope,
    );
    const { jobRunId } = await enqueue({
      queue: 'documents',
      name: kind === 'export' ? 'privacy.export' : 'privacy.anonymize',
      agencyId: authed.agency.id,
      requestedById: authed.userId,
      data: { requestId },
      idempotencyKey: `privacy:${requestId}`,
    });
    await withAgency(authed.agency.id, (tx) => attachJob(tx, requestId, jobRunId), scope);
    return accepted(jobRunId);
  });
}
