// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { JD_SECTIONS, type AgencyActor } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import {
  addDraftVersion,
  approveVersion,
  createArtifact,
  findArtifact,
} from '@/server/artifacts/service';
import { recordJdApproval } from '@/server/positions/intake';

type Run = <T>(fn: (tx: ScopedTx) => Promise<T>) => Promise<T>;

export const structuredJdContent = (
  requirements: { id: string; text: string; category: string }[] = [],
) => ({
  sections: Object.fromEntries(JD_SECTIONS.map((s) => [s, { status: 'found', summary: 'x' }])),
  requirements: requirements.map((r) => ({ section: 'technical_skills', quote: '', ...r })),
});

/** Approves a (new) structured JD version for the position, as the recruiter would. Returns the version id. */
export async function approveStructuredJd(
  run: Run,
  actor: AgencyActor,
  positionId: string,
  content: unknown = structuredJdContent(),
): Promise<string> {
  const subject = { type: 'position', id: positionId } as const;
  const artifact =
    (await run((tx) => findArtifact(tx, { kind: 'structured_jd', subject }))) ??
    (await run((tx) =>
      createArtifact(tx, { agencyId: actor.agencyId, kind: 'structured_jd', subject }),
    ));
  const version = await run((tx) =>
    addDraftVersion(tx, {
      agencyId: actor.agencyId,
      artifactId: artifact.id,
      content,
      origin: 'human',
      createdById: actor.userId,
    }),
  );
  await run((tx) => approveVersion(tx, actor, version.id));
  return version.id;
}

/** Approves the JD and records the hiring manager's "approved" decision on it. */
export async function approveJdForSourcing(
  run: Run,
  actor: AgencyActor,
  positionId: string,
): Promise<void> {
  await approveStructuredJd(run, actor, positionId);
  await run((tx) =>
    recordJdApproval(tx, actor, positionId, {
      decision: 'approved',
      approverName: 'Hana Choi',
      method: 'email',
      decidedAt: new Date(),
    }),
  );
}
