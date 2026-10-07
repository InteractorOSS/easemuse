// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';
import { findArtifact } from '@/server/artifacts/service';

/** The approved version of the position's structured JD, if there is one. */
export async function approvedJdVersionId(
  tx: ScopedTx,
  positionId: string,
): Promise<string | null> {
  const artifact = await findArtifact(tx, {
    kind: 'structured_jd',
    subject: { type: 'position', id: positionId },
  });
  return artifact?.approvedVersionId ?? null;
}

/**
 * True when the position's current approved JD has a latest decision of "approved" (the check
 * behind the guard "sourcing needs the hiring manager's approval"). Kept apart from the position
 * service so that service can use it without a circular import.
 */
export async function isJdApproved(tx: ScopedTx, positionId: string): Promise<boolean> {
  const version = await approvedJdVersionId(tx, positionId);
  if (!version) return false;
  const latest = await tx.approval.findFirst({
    where: { subject: 'jd', subjectId: positionId, versionId: version },
    orderBy: [{ decidedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { decision: true },
  });
  return latest?.decision === 'approved';
}
