// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  candidateFieldsFromProfile,
  candidateProfileContentSchema,
  type AgencyActor,
  type ConfirmCandidateInput,
  type DuplicateResolution,
} from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import {
  addDraftVersion,
  approveVersion,
  discardVersion,
  findArtifact,
  findOrCreateArtifact,
  getArtifactWithVersions,
} from '@/server/artifacts/service';
import { findDuplicates } from './duplicates';

export interface ConfirmResult {
  candidateId: string;
  resolution: DuplicateResolution;
  /** For `merge`: the candidate the draft was merged into (the draft id is no longer a candidate). */
  mergedIntoId: string | null;
}

async function loadDraft(tx: ScopedTx, candidateId: string) {
  const draft = await tx.candidate.findUnique({ where: { id: candidateId } });
  if (!draft) throw notFound('Candidate');
  if (draft.status !== 'draft')
    throw new ApiError('conflict', 'This candidate is already confirmed', { status: 409 });
  return draft;
}

/**
 * The profile version to confirm: the newest draft, or, if the recruiter already approved the
 * profile in the editor, the approved one. Content is returned with it.
 */
async function profileToConfirm(tx: ScopedTx, candidateId: string) {
  const artifact = await findArtifact(tx, {
    kind: 'candidate_profile',
    subject: { type: 'candidate', id: candidateId },
  });
  if (!artifact) return null;
  const full = await getArtifactWithVersions(tx, artifact.id);
  const draft = full.versions.find((v) => v.status === 'draft');
  if (draft) return { artifactId: artifact.id, version: draft, approved: false };
  const approved = full.versions.find((v) => v.id === full.approvedVersionId);
  return approved ? { artifactId: artifact.id, version: approved, approved: true } : null;
}

async function assertActiveTarget(tx: ScopedTx, targetId: string | undefined, selfId: string) {
  if (!targetId || targetId === selfId) {
    throw new ApiError('invalid_input', 'Choose the existing candidate', {
      status: 422,
      fields: { targetId: 'Choose the existing candidate' },
    });
  }
  const target = await tx.candidate.findUnique({
    where: { id: targetId },
    select: { id: true, status: true, mergedIntoId: true },
  });
  if (!target || target.status !== 'active' || target.mergedIntoId) {
    throw new ApiError('invalid_input', 'That candidate is not available', {
      status: 422,
      fields: { targetId: 'Not an active candidate' },
    });
  }
  return target;
}

/**
 * Confirms a draft candidate (T-2-05, US-202/203): the recruiter has reviewed the AI profile and the
 * duplicate list. The draft profile is approved (which fills the candidate's fields and match keys),
 * and the candidate becomes active. Duplicates need an explicit resolution: `create` anyway (with a
 * reason), `link` to the existing one, or `merge` into it (T-2-06). Without a resolution and with
 * duplicates the answer is 409 `possible_duplicate`.
 */
export async function confirmCandidate(
  tx: ScopedTx,
  actor: AgencyActor,
  input: ConfirmCandidateInput,
): Promise<ConfirmResult> {
  const draft = await loadDraft(tx, input.draftId);
  const profileDraft = await profileToConfirm(tx, draft.id);
  if (!profileDraft) {
    throw new ApiError('conflict', 'There is no profile draft to confirm yet', { status: 409 });
  }
  const profile = candidateProfileContentSchema.safeParse(profileDraft.version.content);
  if (!profile.success)
    throw new ApiError('invalid_input', 'The profile draft is not complete', { status: 422 });
  const fields = candidateFieldsFromProfile(profile.data);
  if (!fields.fullName) {
    throw new ApiError('invalid_input', 'The candidate needs a name', {
      status: 422,
      fields: { fullName: 'Enter the name' },
    });
  }

  const duplicates = await findDuplicates(tx, {
    excludeId: draft.id,
    fullName: fields.fullName,
    email: fields.email,
    phone: fields.phone,
    profileUrl: draft.profileUrl,
    employers: fields.employers,
  });
  if (duplicates.length > 0 && !input.resolution) {
    throw new ApiError('possible_duplicate', 'This looks like someone already in your database', {
      status: 409,
    });
  }
  const resolution: DuplicateResolution = input.resolution ?? 'create';

  if (resolution === 'merge') {
    const target = await assertActiveTarget(tx, input.targetId, draft.id);
    await mergeDraftInto(tx, actor, draft.id, target.id, input.reason);
    return { candidateId: target.id, resolution, mergedIntoId: target.id };
  }
  if (duplicates.length > 0 && resolution === 'create' && !input.reason) {
    throw new ApiError('invalid_input', 'Say why this is not a duplicate', {
      status: 422,
      fields: { reason: 'Enter a reason' },
    });
  }
  const linked =
    resolution === 'link' ? await assertActiveTarget(tx, input.targetId, draft.id) : null;

  if (!profileDraft.approved) await approveVersion(tx, actor, profileDraft.version.id);
  await tx.candidate.update({ where: { id: draft.id }, data: { status: 'active' } });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.confirmed',
    entityType: 'candidate',
    entityId: draft.id,
    data: {
      resolution,
      duplicates: duplicates.map((d) => d.candidateId),
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });
  if (linked) {
    // Two people kept apart on purpose but known to be related: the link is a note on both timelines.
    for (const [from, to] of [
      [draft.id, linked.id],
      [linked.id, draft.id],
    ] as const) {
      await logActivity(tx, {
        agencyId: actor.agencyId,
        actor: { type: 'user', id: actor.userId },
        action: 'candidate.linked',
        entityType: 'candidate',
        entityId: from,
        data: { candidateId: to, ...(input.reason ? { reason: input.reason } : {}) },
      });
    }
  }
  return { candidateId: draft.id, resolution, mergedIntoId: null };
}

/**
 * Merges a draft into an existing candidate (T-2-06, US-203). Nothing is lost: the draft's resumes
 * move to the existing candidate next to the ones it already has, the draft's profile becomes a NEW
 * DRAFT version of the existing candidate's profile for the recruiter to review (the approved
 * profile does not change by itself), and the draft is closed with a pointer to the survivor.
 */
export async function mergeDraftInto(
  tx: ScopedTx,
  actor: AgencyActor,
  draftId: string,
  targetId: string,
  reason?: string,
): Promise<void> {
  const moved = await tx.candidateDocument.findMany({
    where: { candidateId: draftId },
    select: { id: true },
  });
  await tx.candidateDocument.updateMany({
    where: { candidateId: draftId },
    data: { candidateId: targetId },
  });

  const profileDraft = await profileToConfirm(tx, draftId);
  let refreshedVersionId: string | null = null;
  if (profileDraft) {
    const targetArtifact = await findOrCreateArtifact(tx, {
      agencyId: actor.agencyId,
      kind: 'candidate_profile',
      subject: { type: 'candidate', id: targetId },
    });
    const added = await addDraftVersion(tx, {
      agencyId: actor.agencyId,
      artifactId: targetArtifact.id,
      content: profileDraft.version.content,
      origin: profileDraft.version.origin,
      createdById: actor.userId,
      aiGenerationId: profileDraft.version.aiGenerationId,
    });
    refreshedVersionId = added.id;
    if (!profileDraft.approved) await discardVersion(tx, actor, profileDraft.version.id);
  }

  await tx.candidate.update({
    where: { id: draftId },
    data: { status: 'discarded', mergedIntoId: targetId },
  });
  const data = {
    documentIds: moved.map((d) => d.id),
    ...(refreshedVersionId ? { profileDraftVersionId: refreshedVersionId } : {}),
    ...(reason ? { reason } : {}),
  };
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.merged',
    entityType: 'candidate',
    entityId: targetId,
    data: { fromCandidateId: draftId, ...data },
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'candidate.merged_away',
    entityType: 'candidate',
    entityId: draftId,
    data: { intoCandidateId: targetId },
  });
}
