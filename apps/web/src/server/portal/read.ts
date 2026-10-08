// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  portalSnapshotSchema,
  type PortalActor,
  type PortalShareKind,
  type PortalSnapshot,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { notFound } from '@/lib/http/errors';
import type { ObjectStore } from '@/server/files/object-store';
import { openFileForDownload, type Download } from '@/server/files/files';

/**
 * What the portal reads (ADR-003): only the published snapshot of shares addressed to this person
 * and not revoked. This module never queries the recruiter-side tables for content, so a portal
 * cannot show anything that was not published on purpose.
 */
export interface ShareSummary {
  id: string;
  kind: PortalShareKind;
  title: string;
  subtitle: string;
  publishedAt: string;
}

export interface ShareDetail {
  id: string;
  kind: PortalShareKind;
  snapshot: PortalSnapshot;
  /** A newer share of the same item replaced this one when `updatedOn` is set on the newest. */
  updatedOn: string | null;
}

const titleOf = (s: PortalSnapshot) =>
  s.kind === 'submission'
    ? s.candidateName
    : s.kind === 'jd_for_approval'
      ? s.positionTitle
      : s.positionTitle;
const subtitleOf = (s: PortalSnapshot) =>
  s.kind === 'submission' ? `${s.positionTitle} · ${s.clientName}` : s.clientName;

export async function listMyShares(tx: ScopedTx, actor: PortalActor): Promise<ShareSummary[]> {
  const rows = await tx.portalShare.findMany({
    where: { portalUserId: actor.portalUserId, revokedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return rows.flatMap((row) => {
    const parsed = portalSnapshotSchema.safeParse(row.snapshot);
    return parsed.success
      ? [
          {
            id: row.id,
            kind: row.kind as PortalShareKind,
            title: titleOf(parsed.data),
            subtitle: subtitleOf(parsed.data),
            publishedAt: parsed.data.publishedAt,
          },
        ]
      : [];
  });
}

/** One share of mine. Someone else's, a revoked one and a missing one are all the same 404. */
export async function getMyShare(
  tx: ScopedTx,
  actor: PortalActor,
  shareId: string,
): Promise<ShareDetail> {
  const row = await tx.portalShare.findFirst({
    where: { id: shareId, portalUserId: actor.portalUserId, revokedAt: null },
  });
  if (!row) throw notFound('Share');
  const parsed = portalSnapshotSchema.safeParse(row.snapshot);
  if (!parsed.success) throw notFound('Share');
  // An earlier version of the same item (revoked when this one was published) means "updated on".
  const earlier = await tx.portalShare.findFirst({
    where: {
      portalUserId: actor.portalUserId,
      kind: row.kind,
      subjectId: row.subjectId,
      id: { not: row.id },
      createdAt: { lt: row.createdAt },
    },
    select: { id: true },
  });
  return {
    id: row.id,
    kind: row.kind as PortalShareKind,
    snapshot: parsed.data,
    updatedOn: earlier ? parsed.data.publishedAt : null,
  };
}

/** A file of a share, only if that share lists it (ADR-003 implementation notes). */
export async function openMyShareFile(
  tx: ScopedTx,
  store: ObjectStore | null,
  actor: PortalActor,
  shareId: string,
  fileId: string,
): Promise<Download> {
  const { snapshot } = await getMyShare(tx, actor, shareId);
  const listed =
    snapshot.kind === 'submission' &&
    (snapshot.reportFile.fileId === fileId || snapshot.resumeFile.fileId === fileId);
  if (!listed) throw notFound('File');
  const row = await tx.portalShare.findUniqueOrThrow({
    where: { id: shareId },
    select: { agencyId: true },
  });
  return openFileForDownload(tx, store, { agencyId: row.agencyId, fileId });
}
