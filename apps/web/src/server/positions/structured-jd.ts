// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { findArtifact } from '@/server/artifacts/service';
import { requirePosition } from './service';

/** Where the position's structured JD lives, if one has been drafted. */
export async function getStructuredJdArtifact(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<{ artifactId: string | null; approvedVersionId: string | null }> {
  await requirePosition(tx, actor, positionId, 'read');
  const artifact = await findArtifact(tx, {
    kind: 'structured_jd',
    subject: { type: 'position', id: positionId },
  });
  return {
    artifactId: artifact?.id ?? null,
    approvedVersionId: artifact?.approvedVersionId ?? null,
  };
}

export interface RequirementView {
  id: string;
  section: string;
  text: string;
  category: string;
  sortOrder: number;
}

/** The approved requirements, in the recruiter's order. */
export async function listRequirements(
  tx: ScopedTx,
  actor: AgencyActor,
  positionId: string,
): Promise<RequirementView[]> {
  await requirePosition(tx, actor, positionId, 'read');
  return tx.requirement.findMany({
    where: { positionId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { id: true, section: true, text: true, category: true, sortOrder: true },
  });
}
