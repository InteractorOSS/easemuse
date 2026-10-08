// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { tailoredResumeContentSchema, type AgencyActor } from '@easemuse/core';
import { resolveLocale } from '@/i18n/config';
import { loadMessages } from '@/i18n/messages';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { logActivity } from '@/server/activity/service';
import { findArtifact } from '@/server/artifacts/service';
import { buildResumeDocx } from '@/server/documents/resume-docx';
import { findRenderedDocument, loadRenderSource } from '@/server/documents/render/service';
import { requireEntry } from '@/server/pipeline/service';

/** The approved tailored resume is what gets exported; without one the answer is 409. */
async function approvedVersion(tx: ScopedTx, entryId: string): Promise<string> {
  const artifact = await findArtifact(tx, {
    kind: 'tailored_resume',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  if (!artifact?.approvedVersionId) {
    throw new ApiError('conflict', 'Approve the tailored resume before exporting it', {
      status: 409,
    });
  }
  return artifact.approvedVersionId;
}

/** The newest PDF of the approved resume and whether it still matches the approved content and branding. */
export async function getResumePdfStatus(tx: ScopedTx, actor: AgencyActor, entryId: string) {
  await requireEntry(tx, actor, entryId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'tailored_resume',
    subject: { type: 'pipeline_entry', id: entryId },
  });
  const versionId = artifact?.approvedVersionId ?? null;
  if (!versionId) return { versionId: null, document: null };
  return {
    versionId,
    document: await findRenderedDocument(tx, {
      agencyId: actor.agencyId,
      kind: 'resume',
      versionId,
    }),
  };
}

async function logExport(
  tx: ScopedTx,
  actor: AgencyActor,
  entryId: string,
  format: string,
  versionId: string,
) {
  const entry = await tx.pipelineEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: { candidateId: true },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'resume.exported',
    entityType: 'candidate',
    entityId: entry.candidateId,
    data: { entryId, format, versionId },
  });
}

/** Queues the PDF render of the approved resume. The same content and branding is not rendered twice. */
export async function startResumePdfExport(
  actor: AgencyActor,
  entryId: string,
): Promise<{ jobRunId: string; versionId: string }> {
  const { versionId, hash } = await withAgency(
    actor.agencyId,
    async (tx) => {
      await requireEntry(tx, actor, entryId, 'edit');
      const versionId = await approvedVersion(tx, entryId);
      const source = await loadRenderSource(tx, actor.agencyId, 'resume', versionId);
      await logExport(tx, actor, entryId, 'pdf', versionId);
      return { versionId, hash: source.hash };
    },
    { userId: actor.userId },
  );
  const { jobRunId } = await enqueue({
    queue: 'documents',
    name: 'render',
    agencyId: actor.agencyId,
    requestedById: actor.userId,
    data: { kind: 'resume', versionId },
    idempotencyKey: `render:resume:${versionId}:${hash}`,
  });
  return { jobRunId, versionId };
}

/** Builds the DOCX of the approved resume, in the agency's language, and logs the export. */
export async function exportResumeDocx(
  actor: AgencyActor,
  entryId: string,
  agencyLocale: string | null,
) {
  const source = await withAgency(
    actor.agencyId,
    async (tx) => {
      await requireEntry(tx, actor, entryId, 'edit');
      const versionId = await approvedVersion(tx, entryId);
      const loaded = await loadRenderSource(tx, actor.agencyId, 'resume', versionId);
      await logExport(tx, actor, entryId, 'docx', versionId);
      return loaded;
    },
    { userId: actor.userId },
  );
  const messages = (await loadMessages(resolveLocale({ agencyLocale }))) as unknown as {
    pipeline: { resume: { roles: string; education: string; skills: string; present: string } };
  };
  const content = tailoredResumeContentSchema.parse(source.version.content);
  const bytes = await buildResumeDocx({
    content,
    branding: source.branding,
    logo: source.logo
      ? { bytes: source.logo.bytes, name: source.branding.displayName ?? '' }
      : null,
    labels: messages.pipeline.resume,
  });
  const base = content.header.name ?? 'resume';
  const safe =
    base
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'resume';
  return { bytes, filename: `${safe}.docx` };
}
