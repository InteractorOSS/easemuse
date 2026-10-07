// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { type AgencyActor, type JdSection, type RequirementCategoryValue } from '@easemuse/core';
import { resolveLocale } from '@/i18n/config';
import { loadMessages } from '@/i18n/messages';
import { withAgency, type ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { enqueue } from '@/lib/queue';
import { logActivity } from '@/server/activity/service';
import { buildJdDocumentModel } from '@/server/documents/jd-document';
import { buildJdDocx } from '@/server/documents/jd-docx';
import { findRenderedDocument, loadRenderSource } from '@/server/documents/render/service';
import { approvedJdVersionId } from './jd-approval';
import { requirePosition } from './service';

export const exportInputSchema = z.object({ format: z.enum(['docx', 'pdf']) });
export type ExportInput = z.infer<typeof exportInputSchema>;

/** The approved structured JD is what gets exported; without one the answer is 409. */
async function approvedVersion(tx: ScopedTx, positionId: string): Promise<string> {
  const versionId = await approvedJdVersionId(tx, positionId);
  if (!versionId)
    throw new ApiError('conflict', 'Approve the structured JD before exporting it', {
      status: 409,
    });
  return versionId;
}

/** The newest PDF of the approved JD and whether it still matches the approved content and branding. */
export async function getPdfStatus(tx: ScopedTx, actor: AgencyActor, positionId: string) {
  await requirePosition(tx, actor, positionId, 'read');
  const versionId = await approvedJdVersionId(tx, positionId);
  if (!versionId) return { versionId: null, document: null };
  return {
    versionId,
    document: await findRenderedDocument(tx, { agencyId: actor.agencyId, kind: 'jd', versionId }),
  };
}

/** Queues the PDF render of the approved JD. The same content and branding is not rendered twice. */
export async function startPdfExport(
  actor: AgencyActor,
  positionId: string,
): Promise<{ jobRunId: string; versionId: string }> {
  const { versionId, hash } = await withAgency(
    actor.agencyId,
    async (tx) => {
      await requirePosition(tx, actor, positionId, 'edit');
      const versionId = await approvedVersion(tx, positionId);
      const source = await loadRenderSource(tx, actor.agencyId, 'jd', versionId);
      await logActivity(tx, {
        agencyId: actor.agencyId,
        actor: { type: 'user', id: actor.userId },
        action: 'position.jd_exported',
        entityType: 'position',
        entityId: positionId,
        data: { format: 'pdf', versionId },
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
    data: { kind: 'jd', versionId },
    idempotencyKey: `render:jd:${versionId}:${hash}`,
  });
  return { jobRunId, versionId };
}

/** Builds the DOCX of the approved JD, in the agency's language, and logs the export. */
export async function exportDocx(
  actor: AgencyActor,
  positionId: string,
  agencyLocale: string | null,
) {
  const source = await withAgency(
    actor.agencyId,
    async (tx) => {
      await requirePosition(tx, actor, positionId, 'edit');
      const versionId = await approvedVersion(tx, positionId);
      const loaded = await loadRenderSource(tx, actor.agencyId, 'jd', versionId);
      await logActivity(tx, {
        agencyId: actor.agencyId,
        actor: { type: 'user', id: actor.userId },
        action: 'position.jd_exported',
        entityType: 'position',
        entityId: positionId,
        data: { format: 'docx', versionId },
      });
      return loaded;
    },
    { userId: actor.userId },
  );
  const messages = (await loadMessages(resolveLocale({ agencyLocale }))) as unknown as {
    positions: {
      jdSections: Record<JdSection, string>;
      categories: Record<RequirementCategoryValue, string>;
      print: { title: string };
    };
  };
  const { context, branding } = source;
  const title = context.position?.title ?? messages.positions.print.title;
  const bytes = await buildJdDocx({
    title,
    subtitle: context.position ? `${context.position.client} · ${context.position.location}` : null,
    agencyName: context.agency,
    branding,
    model: buildJdDocumentModel(source.version.content, {
      section: (key) => messages.positions.jdSections[key],
      category: (c) => messages.positions.categories[c],
    }),
  });
  const safe =
    title
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'job-description';
  return { bytes, filename: `${safe}.docx` };
}
