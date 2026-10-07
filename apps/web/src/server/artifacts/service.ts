// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import {
  ARTIFACT_KIND_SPECS,
  applyResolutions,
  factCheckSchema,
  filledHumanOnlyFields,
  missingRequiredFields,
  parseArtifactContent,
  unresolvedWarnings,
  type AgencyActor,
  type ArtifactKind,
  type FactCheck,
  type FactCheckResolutionsInput,
  type SubjectType,
} from '@easemuse/core';
import { ZodError } from 'zod';
import type { ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { zodFields } from '@/lib/http/responses';
import { runApprovalHooks } from './hooks';

/**
 * The artifact lifecycle (ADR-006): `draft` versions are created by AI or people, edits create new
 * versions, and ONLY `approveVersion` makes content official. Domain code reads approved content
 * through `readApproved`; drafts are visible only to this module and the review surfaces
 * (a guard test enforces it, T-AI-06).
 */
export type VersionOrigin = 'ai' | 'human' | 'ai_edited';

export interface Subject {
  type: SubjectType;
  id: string;
}

export interface VersionRecord {
  id: string;
  artifactId: string;
  version: number;
  status: 'draft' | 'approved' | 'superseded' | 'discarded';
  origin: VersionOrigin;
  content: Record<string, unknown>;
  factCheck: FactCheck | null;
  aiGenerationId: string | null;
  parentVersionId: string | null;
  createdById: string;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

const conflict = (code: string, message: string, extra: { fields?: Record<string, string> } = {}) =>
  new ApiError(code, message, { status: 409, ...extra });

function toRecord(row: {
  id: string;
  artifactId: string;
  version: number;
  status: VersionRecord['status'];
  origin: string;
  content: Prisma.JsonValue;
  factCheck: Prisma.JsonValue | null;
  aiGenerationId: string | null;
  parentVersionId: string | null;
  createdById: string;
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}): VersionRecord {
  const parsedFactCheck = row.factCheck === null ? null : factCheckSchema.safeParse(row.factCheck);
  return {
    id: row.id,
    artifactId: row.artifactId,
    version: row.version,
    status: row.status,
    origin: row.origin as VersionOrigin,
    content: row.content as Record<string, unknown>,
    factCheck: parsedFactCheck && parsedFactCheck.success ? parsedFactCheck.data : null,
    aiGenerationId: row.aiGenerationId,
    parentVersionId: row.parentVersionId,
    createdById: row.createdById,
    approvedById: row.approvedById,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
  };
}

function validateContent(kind: ArtifactKind, content: unknown): Record<string, unknown> {
  try {
    return parseArtifactContent(kind, content);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(
        'invalid_input',
        'The content does not match what this kind of document needs',
        {
          status: 422,
          fields: zodFields(error),
        },
      );
    }
    throw error;
  }
}

/** Creates the artifact (the container) for a subject. The subject type must be the one the kind belongs to. */
export async function createArtifact(
  tx: ScopedTx,
  input: { agencyId: string; kind: ArtifactKind; subject: Subject },
): Promise<{ id: string }> {
  const spec = ARTIFACT_KIND_SPECS[input.kind];
  if (spec.subjectType !== input.subject.type) {
    throw new ApiError(
      'invalid_input',
      `A ${input.kind} belongs to a ${spec.subjectType}, not a ${input.subject.type}`,
      { status: 422 },
    );
  }
  return tx.artifact.create({
    data: {
      agencyId: input.agencyId,
      kind: input.kind,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
    },
    select: { id: true },
  });
}

/** The newest artifact of this kind for the subject, or null. */
export async function findArtifact(tx: ScopedTx, input: { kind: ArtifactKind; subject: Subject }) {
  return tx.artifact.findFirst({
    where: { kind: input.kind, subjectType: input.subject.type, subjectId: input.subject.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, approvedVersionId: true },
  });
}

export async function findOrCreateArtifact(
  tx: ScopedTx,
  input: { agencyId: string; kind: ArtifactKind; subject: Subject },
): Promise<{ id: string }> {
  return (await findArtifact(tx, input)) ?? createArtifact(tx, input);
}

export interface AddDraftInput {
  agencyId: string;
  artifactId: string;
  content: unknown;
  origin: VersionOrigin;
  createdById: string;
  aiGenerationId?: string | null;
  parentVersionId?: string | null;
  factCheck?: FactCheck | null;
}

/**
 * Adds a new DRAFT version. Content is validated against the kind's schema. AI-origin content may
 * not fill human-only fields (the recruiter's own assessment, brief §1.1).
 */
export async function addDraftVersion(tx: ScopedTx, input: AddDraftInput): Promise<VersionRecord> {
  const artifact = await tx.artifact.findUnique({ where: { id: input.artifactId } });
  if (!artifact) throw notFound('Artifact');
  const kind = artifact.kind as ArtifactKind;
  const content = validateContent(kind, input.content);

  if (input.origin === 'ai') {
    const filled = filledHumanOnlyFields(kind, content);
    if (filled.length > 0) {
      throw new ApiError('human_only_field', `AI cannot write: ${filled.join(', ')}`, {
        status: 422,
        fields: Object.fromEntries(filled.map((f) => [f, 'Only a recruiter writes this'])),
      });
    }
  }

  // The unique (artifactId, version) index settles a race between two writers: retry once.
  for (let attempt = 0; ; attempt++) {
    const latest = await tx.artifactVersion.aggregate({
      where: { artifactId: artifact.id },
      _max: { version: true },
    });
    try {
      const row = await tx.artifactVersion.create({
        data: {
          agencyId: input.agencyId,
          artifactId: artifact.id,
          version: (latest._max.version ?? 0) + 1,
          content: content as Prisma.InputJsonValue,
          status: 'draft',
          origin: input.origin,
          aiGenerationId: input.aiGenerationId ?? null,
          parentVersionId: input.parentVersionId ?? null,
          factCheck: input.factCheck
            ? (input.factCheck as unknown as Prisma.InputJsonValue)
            : undefined,
          createdById: input.createdById,
        },
      });
      return toRecord(row);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' && attempt === 0) continue;
      throw error;
    }
  }
}

async function loadVersion(tx: ScopedTx, versionId: string) {
  const version = await tx.artifactVersion.findUnique({
    where: { id: versionId },
    include: { artifact: true },
  });
  if (!version) throw notFound('Version');
  return version;
}

/**
 * A person edits a draft: the edit is a NEW draft version (origin `ai_edited` when it builds on AI
 * output, else `human`) that points at its parent, so the AI original and every edit stay visible
 * (FR-AI-04). The version it replaces becomes `superseded`.
 */
export async function editDraft(
  tx: ScopedTx,
  actor: AgencyActor,
  versionId: string,
  content: unknown,
): Promise<VersionRecord> {
  const parent = await loadVersion(tx, versionId);
  if (parent.status !== 'draft') throw conflict('not_draft', 'Only a draft can be edited');
  const next = await addDraftVersion(tx, {
    agencyId: actor.agencyId,
    artifactId: parent.artifactId,
    content,
    origin: parent.origin === 'human' ? 'human' : 'ai_edited',
    createdById: actor.userId,
    parentVersionId: parent.id,
    factCheck: parent.factCheck ? (factCheckSchema.safeParse(parent.factCheck).data ?? null) : null,
  });
  await tx.artifactVersion.update({ where: { id: parent.id }, data: { status: 'superseded' } });
  return next;
}

/**
 * Saves a person's edit of the artifact's latest version (the contract `POST /artifacts/:id/versions`).
 * Editing a draft supersedes it; editing after approval starts a NEW draft from the approved text
 * while the approved version stays official until the new one is approved.
 */
export async function saveEditToLatest(
  tx: ScopedTx,
  actor: AgencyActor,
  artifactId: string,
  content: unknown,
): Promise<VersionRecord> {
  const latest = await tx.artifactVersion.findFirst({
    where: { artifactId, status: { in: ['draft', 'approved'] } },
    orderBy: { version: 'desc' },
  });
  if (!latest) throw notFound('Artifact');
  if (latest.status === 'draft') return editDraft(tx, actor, latest.id, content);
  const next = await addDraftVersion(tx, {
    agencyId: actor.agencyId,
    artifactId,
    content,
    origin: latest.origin === 'human' ? 'human' : 'ai_edited',
    createdById: actor.userId,
    parentVersionId: latest.id,
  });
  return next;
}

/** Throws the draft away. Approved versions cannot be discarded (supersede them by approving a newer one). */
export async function discardVersion(
  tx: ScopedTx,
  actor: AgencyActor,
  versionId: string,
  options: { expectedArtifactId?: string } = {},
): Promise<VersionRecord> {
  const version = await loadVersion(tx, versionId);
  if (options.expectedArtifactId && version.artifactId !== options.expectedArtifactId)
    throw notFound('Version');
  if (version.status !== 'draft') throw conflict('not_draft', 'Only a draft can be discarded');
  const row = await tx.artifactVersion.update({
    where: { id: version.id },
    data: { status: 'discarded' },
  });
  await tx.activityLog.create({
    data: {
      agencyId: actor.agencyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'artifact.discarded',
      entityType: 'artifact',
      entityId: version.artifactId,
      data: { kind: version.artifact.kind, versionId },
    },
  });
  return toRecord(row);
}

/**
 * Approves a draft: the single place content becomes official (ADR-006). Checks the kind's rules
 * (required and human-only fields, resolved fact-check warnings), points the artifact at the
 * version, supersedes the previously approved one, logs it, and runs the stale-marking hooks.
 */
export async function approveVersion(
  tx: ScopedTx,
  actor: AgencyActor,
  versionId: string,
  options: {
    factCheckResolutions?: FactCheckResolutionsInput;
    now?: Date;
    expectedArtifactId?: string;
  } = {},
): Promise<{ artifactId: string; versionId: string; version: number }> {
  const now = options.now ?? new Date();
  const version = await loadVersion(tx, versionId);
  if (options.expectedArtifactId && version.artifactId !== options.expectedArtifactId)
    throw notFound('Version');
  if (version.status !== 'draft') throw conflict('not_draft', 'Only a draft can be approved');
  const kind = version.artifact.kind as ArtifactKind;
  const spec = ARTIFACT_KIND_SPECS[kind];
  const content = version.content as Record<string, unknown>;

  if (version.origin === 'ai') {
    const filled = filledHumanOnlyFields(kind, content);
    if (filled.length > 0)
      throw new ApiError('human_only_field', `AI cannot write: ${filled.join(', ')}`, {
        status: 422,
      });
  }
  const missing = missingRequiredFields(kind, content);
  if (missing.length > 0) {
    throw conflict(
      missing.includes('recruiterAssessment')
        ? 'missing_recruiter_assessment'
        : 'missing_required_field',
      `Missing: ${missing.join(', ')}`,
      { fields: Object.fromEntries(missing.map((f) => [f, 'Required before approval'])) },
    );
  }

  let factCheck: FactCheck | null = null;
  if (spec.factCheckRequired) {
    const stored = factCheckSchema.safeParse(version.factCheck);
    if (!stored.success)
      throw conflict('factcheck_not_run', 'The fact check has not run for this draft');
    const applied = applyResolutions(
      stored.data,
      options.factCheckResolutions ?? {},
      actor.userId,
      now,
    );
    if (!applied.ok) {
      throw new ApiError(
        'invalid_input',
        applied.reason === 'reason_required'
          ? 'Confirming a warning needs a reason'
          : 'Unknown fact-check warning',
        { status: 422, fields: { [`factCheckResolutions.${applied.warningId}`]: applied.reason } },
      );
    }
    factCheck = applied.factCheck;
    const open = unresolvedWarnings(factCheck);
    if (open.length > 0) {
      throw conflict(
        'factcheck_unresolved',
        `${open.length} fact-check warning(s) need a decision`,
        {
          fields: Object.fromEntries(open.map((w) => [`factCheckResolutions.${w.id}`, w.claim])),
        },
      );
    }
  }

  const previous = version.artifact.approvedVersionId;
  if (previous && previous !== version.id) {
    await tx.artifactVersion.update({ where: { id: previous }, data: { status: 'superseded' } });
  }
  await tx.artifactVersion.update({
    where: { id: version.id },
    data: {
      status: 'approved',
      approvedById: actor.userId,
      approvedAt: now,
      ...(factCheck ? { factCheck: factCheck as unknown as Prisma.InputJsonValue } : {}),
    },
  });
  await tx.artifact.update({
    where: { id: version.artifactId },
    data: { approvedVersionId: version.id },
  });
  await tx.activityLog.create({
    data: {
      agencyId: actor.agencyId,
      actorType: 'user',
      actorId: actor.userId,
      action: 'artifact.approved',
      entityType: 'artifact',
      entityId: version.artifactId,
      data: { kind, versionId: version.id, version: version.version, origin: version.origin },
    },
  });
  await runApprovalHooks(tx, {
    agencyId: actor.agencyId,
    kind,
    subject: { type: version.artifact.subjectType as SubjectType, id: version.artifact.subjectId },
    versionId: version.id,
  });
  return { artifactId: version.artifactId, versionId: version.id, version: version.version };
}

/**
 * The read rule (FR-AI-02): downstream features use the APPROVED version only. Returns null when
 * nothing has been approved yet, never a draft.
 */
export async function readApproved(
  tx: ScopedTx,
  input: { kind: ArtifactKind; subject: Subject },
): Promise<VersionRecord | null> {
  const artifact = await tx.artifact.findFirst({
    where: {
      kind: input.kind,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      approvedVersionId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!artifact?.approvedVersionId) return null;
  const row = await tx.artifactVersion.findUnique({ where: { id: artifact.approvedVersionId } });
  return row && row.status === 'approved' ? toRecord(row) : null;
}

/** Review surfaces only (editor, review dashboard): the artifact with every version, newest first. */
export async function getArtifactWithVersions(tx: ScopedTx, artifactId: string) {
  const artifact = await tx.artifact.findUnique({
    where: { id: artifactId },
    include: { versions: { orderBy: { version: 'desc' } } },
  });
  if (!artifact) throw notFound('Artifact');
  return {
    id: artifact.id,
    kind: artifact.kind as ArtifactKind,
    subject: { type: artifact.subjectType as SubjectType, id: artifact.subjectId },
    approvedVersionId: artifact.approvedVersionId,
    versions: artifact.versions.map(toRecord),
  };
}

/** Provenance view: which versions came out of one AI generation (metadata only, no content). */
export async function listVersionsOfGeneration(tx: ScopedTx, aiGenerationId: string) {
  const rows = await tx.artifactVersion.findMany({
    where: { aiGenerationId },
    select: { id: true, artifactId: true, version: true, status: true },
    orderBy: { version: 'asc' },
  });
  return rows.map((v) => ({
    artifactId: v.artifactId,
    versionId: v.id,
    version: v.version,
    status: v.status as string,
  }));
}
