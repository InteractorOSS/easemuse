// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { parseBranding, type AgencyBranding } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { readApprovedVersionById } from '@/server/artifacts/service';
import { saveGeneratedFile } from '@/server/files/files';
import type { ObjectStore } from '@/server/files/object-store';
import { storeOriginal } from '@/server/documents/store';
import { renderHash, type RenderKind } from './hash';
import type { PdfRenderer } from './renderer';
import { signRenderToken } from './token';

/** The artifact kind each print template renders. */
const KIND_OF: Record<RenderKind, 'structured_jd' | 'tailored_resume' | 'submission_report'> = {
  jd: 'structured_jd',
  resume: 'tailored_resume',
  report: 'submission_report',
};

export interface RenderDeps {
  withAgency<T>(fn: (tx: ScopedTx) => Promise<T>): Promise<T>;
  renderer: PdfRenderer;
  /** Where generated files go (ADR-011). Without one the PDF is kept in the database (development). */
  store: ObjectStore | null;
  /** Base URL the browser uses to reach the print route. */
  baseUrl: string;
  secret: string;
}

export interface RenderResult {
  documentId: string;
  fileId: string;
  contentHash: string;
  /** True when an identical render already existed and nothing was rendered. */
  reused: boolean;
}

/** Everything a print template needs, read from the approved version and the records it refers to. */
export async function loadRenderSource(
  tx: ScopedTx,
  agencyId: string,
  kind: RenderKind,
  versionId: string,
) {
  const version = await readApprovedVersionById(tx, versionId);
  if (!version || version.kind !== KIND_OF[kind]) throw notFound('Approved version');
  const agency = await tx.agency.findUnique({
    where: { id: agencyId },
    select: { name: true, branding: true },
  });
  const position =
    version.subject.type === 'position'
      ? await tx.position.findUnique({
          where: { id: version.subject.id },
          select: { title: true, location: true, client: { select: { name: true } } },
        })
      : null;
  // The report page names the candidate and the position (the resume page shows neither).
  const entry =
    kind === 'report' && version.subject.type === 'pipeline_entry'
      ? await tx.pipelineEntry.findUnique({
          where: { id: version.subject.id },
          select: {
            candidate: { select: { fullName: true } },
            position: {
              select: { title: true, location: true, client: { select: { name: true } } },
            },
          },
        })
      : null;
  const branding: AgencyBranding = parseBranding(agency?.branding);
  const context = {
    agency: agency?.name ?? null,
    position: position
      ? { title: position.title, location: position.location, client: position.client.name }
      : entry
        ? {
            title: entry.position.title,
            location: entry.position.location,
            client: entry.position.client.name,
          }
        : null,
    ...(kind === 'report' ? { candidate: entry?.candidate.fullName ?? null } : {}),
  };
  return {
    version,
    branding,
    context,
    hash: renderHash({ kind, content: version.content, branding, context }),
  };
}

/**
 * Renders an approved version to PDF (T-1-11, ADR-011). Only APPROVED content is rendered, so a
 * document always matches what the recruiter approved. If a render with the same content hash
 * exists it is returned; otherwise the print route is opened with a short-lived token, printed,
 * stored, and recorded.
 */
export async function renderDocument(
  deps: RenderDeps,
  input: { agencyId: string; requestedById: string | null; kind: RenderKind; versionId: string },
): Promise<RenderResult> {
  const { agencyId, kind, versionId } = input;
  const described = await deps.withAgency((tx) => loadRenderSource(tx, agencyId, kind, versionId));
  const existing = await deps.withAgency((tx) =>
    tx.renderedDocument.findUnique({
      where: {
        versionId_format_contentHash: { versionId, format: 'pdf', contentHash: described.hash },
      },
    }),
  );
  if (existing)
    return {
      documentId: existing.id,
      fileId: existing.fileId,
      contentHash: described.hash,
      reused: true,
    };

  const token = signRenderToken({ secret: deps.secret, agencyId, versionId });
  const url = `${deps.baseUrl.replace(/\/$/, '')}/render/${kind}/${versionId}?agency=${agencyId}&token=${encodeURIComponent(token)}`;
  const bytes = await deps.renderer(url);
  if (bytes.byteLength < 100)
    throw new ApiError('internal_error', 'The renderer returned an empty document', {
      status: 502,
    });

  const filename = `${kind}-${versionId.slice(0, 8)}.pdf`;
  return deps.withAgency(async (tx) => {
    const file = deps.store
      ? await saveGeneratedFile(tx, deps.store, {
          agencyId,
          filename,
          contentType: 'application/pdf',
          bytes,
          createdById: input.requestedById,
        })
      : await storeOriginal(tx, { agencyId, filename, bytes, createdById: input.requestedById });
    try {
      const row = await tx.renderedDocument.create({
        data: { agencyId, versionId, format: 'pdf', contentHash: described.hash, fileId: file.id },
      });
      return { documentId: row.id, fileId: file.id, contentHash: described.hash, reused: false };
    } catch (error) {
      // Two renders of the same content raced: keep the first one.
      const winner = await tx.renderedDocument.findUnique({
        where: {
          versionId_format_contentHash: { versionId, format: 'pdf', contentHash: described.hash },
        },
      });
      if (winner)
        return {
          documentId: winner.id,
          fileId: winner.fileId,
          contentHash: described.hash,
          reused: true,
        };
      throw error;
    }
  });
}

/** The newest PDF of a version, and whether it still matches the approved content and branding. */
export async function findRenderedDocument(
  tx: ScopedTx,
  input: { agencyId: string; kind: RenderKind; versionId: string },
): Promise<{ fileId: string; createdAt: Date; upToDate: boolean } | null> {
  const [latest, current] = await Promise.all([
    tx.renderedDocument.findFirst({
      where: { versionId: input.versionId, format: 'pdf' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    loadRenderSource(tx, input.agencyId, input.kind, input.versionId),
  ]);
  if (!latest) return null;
  const match = await tx.renderedDocument.findUnique({
    where: {
      versionId_format_contentHash: {
        versionId: input.versionId,
        format: 'pdf',
        contentHash: current.hash,
      },
    },
  });
  return match
    ? { fileId: match.fileId, createdAt: match.createdAt, upToDate: true }
    : { fileId: latest.fileId, createdAt: latest.createdAt, upToDate: false };
}
