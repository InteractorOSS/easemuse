// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor } from '@easemuse/core';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { logActivity } from '@/server/activity/service';
import { findArtifact } from '@/server/artifacts/service';
import { findRenderedDocument, loadRenderSource } from '@/server/documents/render/service';
import { requireEntry } from '@/server/pipeline/service';

async function approvedReportVersion(tx: ScopedTx, entryId: string): Promise<string | null> {
  const artifact = await findArtifact(tx, {
    kind: 'submission_report',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  return artifact?.approvedVersionId ?? null;
}

/** The newest PDF of the approved report and whether it still matches the approved text and branding. */
export async function getReportPdfStatus(tx: ScopedTx, actor: AgencyActor, entryId: string) {
  await requireEntry(tx, actor, entryId, 'read');
  const versionId = await approvedReportVersion(tx, entryId);
  if (!versionId) return { versionId: null, document: null };
  return {
    versionId,
    document: await findRenderedDocument(tx, {
      agencyId: actor.agencyId,
      kind: 'report',
      versionId,
    }),
  };
}

/** Queues the PDF render of the approved report (US-802). The same text and branding is not rendered twice. */
export async function startReportPdfExport(
  actor: AgencyActor,
  entryId: string,
): Promise<{ jobRunId: string; versionId: string }> {
  const { versionId, hash } = await withAgency(
    actor.agencyId,
    async (tx) => {
      const entry = await requireEntry(tx, actor, entryId, 'edit');
      const versionId = await approvedReportVersion(tx, entryId);
      if (!versionId) {
        throw new ApiError('conflict', 'Approve the report before creating the PDF', {
          status: 409,
        });
      }
      const source = await loadRenderSource(tx, actor.agencyId, 'report', versionId);
      await logActivity(tx, {
        agencyId: actor.agencyId,
        actor: { type: 'user', id: actor.userId },
        action: 'report.exported',
        entityType: 'candidate',
        entityId: entry.candidateId,
        data: { entryId, format: 'pdf', versionId },
      });
      return { versionId, hash: source.hash };
    },
    { userId: actor.userId },
  );
  const { jobRunId } = await enqueue({
    queue: 'documents',
    name: 'render',
    agencyId: actor.agencyId,
    requestedById: actor.userId,
    data: { kind: 'report', versionId },
    idempotencyKey: `render:report:${versionId}:${hash}`,
  });
  return { jobRunId, versionId };
}
