// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
// route-audience: agency
import { authorizeAgency } from '@/lib/auth/authorize';
import { getJobRun } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import { handleRoute, ok } from '@/lib/http/responses';

/**
 * Status and progress of a background job (api-contracts: `GET /jobs/:id`). Visible to the person
 * who started it and to leads and admins of the same agency; anyone else gets a 404.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ agencyId: string; jobRunId: string }> },
): Promise<Response> {
  return handleRoute(async () => {
    const { agencyId, jobRunId } = await ctx.params;
    const authed = await authorizeAgency(agencyId);
    if (authed instanceof Response) return authed;
    const job = await getJobRun(jobRunId).catch(() => null);
    const allowed =
      job &&
      job.agencyId === authed.agency.id &&
      (job.requestedById === authed.userId || authed.actor.role !== 'recruiter');
    if (!job || !allowed) throw notFound('Job');
    return ok({
      id: job.id,
      queue: job.queue,
      name: job.name,
      status: job.status,
      progress: job.progress,
      error: job.error,
    });
  });
}
