// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ArtifactKind, SubjectType } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';

export interface ApprovalContext {
  agencyId: string;
  kind: ArtifactKind;
  subject: { type: SubjectType; id: string };
  versionId: string;
}

type Hook = (tx: ScopedTx, context: ApprovalContext) => Promise<void>;

/**
 * Work that follows an approval, in the same transaction. Built in: approving a new success
 * profile or candidate profile marks the match analyses that used the old one as stale (FR-MAT-07),
 * so a recruiter never relies on a score computed from content that has since changed.
 */
const BUILT_IN: Partial<Record<ArtifactKind, Hook>> = {
  success_profile: async (tx, { subject }) => {
    await tx.matchAnalysis.updateMany({
      where: { entry: { positionId: subject.id }, stale: false },
      data: { stale: true },
    });
  },
  candidate_profile: async (tx, { subject }) => {
    await tx.matchAnalysis.updateMany({
      where: { entry: { candidateId: subject.id }, stale: false },
      data: { stale: true },
    });
  },
};

const extra = new Map<ArtifactKind, Hook[]>();

/** Modules add their own follow-ups here (for example `embedding.index` after a profile is approved). */
export function registerApprovalHook(kind: ArtifactKind, hook: Hook): void {
  extra.set(kind, [...(extra.get(kind) ?? []), hook]);
}

export async function runApprovalHooks(tx: ScopedTx, context: ApprovalContext): Promise<void> {
  await BUILT_IN[context.kind]?.(tx, context);
  for (const hook of extra.get(context.kind) ?? []) await hook(tx, context);
}
