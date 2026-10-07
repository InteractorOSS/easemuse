// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import type { Scope } from '@/lib/db';
import { createOutboxMessage } from '@/server/messaging/outbox';
import { addDraftVersion, createArtifact } from '@/server/artifacts/service';
import { hashToken } from '@/server/tenancy/invites';
import { storeOriginal } from '@/server/documents/store';
import { makePdf } from './fixtures';

/**
 * Data for the isolation harness (T-QA-01, TR-001, US-1301): one agency's worth of rows in the
 * tables the product uses today. As features add tenant tables they extend `seedAgency` AND the
 * `SEEDED_TABLES` list, and the catalog guard in lib/db/rls.guard.db.test.ts makes sure no tenant
 * table exists without isolation.
 */
export interface SeededAgency {
  agencyId: string;
  userId: string;
  clientId: string;
  positionId: string;
  candidateId: string;
  entryId: string;
  artifactId: string;
  versionId: string;
  fileId: string;
  inviteId: string;
  memberUserId: string;
  outboxId: string;
  generationId: string;
}

/** Tables `seedAgency` writes to; the harness checks each one is invisible across agencies. */
export const SEEDED_TABLES = [
  'Client',
  'Position',
  'Candidate',
  'PipelineEntry',
  'Artifact',
  'ArtifactVersion',
  'FileObject',
  'FileBlob',
  'MemberInvite',
  'Membership',
  'OutboxMessage',
  'AiGeneration',
  'LlmCall',
  'ActivityLog',
] as const;

export async function seedAgency(
  scope: Pick<Scope, 'withAgency'>,
  agencyId: string,
  memberUserId: string,
  label: string,
): Promise<SeededAgency> {
  const userId = randomUUID();
  return scope.withAgency(agencyId, async (tx) => {
    const client = await tx.client.create({ data: { agencyId, name: `${label} client` } });
    const position = await tx.position.create({
      data: {
        agencyId,
        clientId: client.id,
        ownerId: userId,
        title: `${label} position`,
        location: 'Remote',
        matchingWeights: {},
      },
    });
    const candidate = await tx.candidate.create({
      data: { agencyId, fullName: `${label} candidate`, source: 'referral', createdById: userId },
    });
    const entry = await tx.pipelineEntry.create({
      data: { agencyId, positionId: position.id, candidateId: candidate.id, ownerId: userId },
    });

    const generation = await tx.aiGeneration.create({
      data: {
        agencyId,
        purpose: 'jd.structure',
        requestedById: userId,
        promptVersion: 'v1',
        model: 'claude-opus-5-5',
        inputRefs: {},
        status: 'succeeded',
      },
    });
    await tx.llmCall.create({
      data: {
        agencyId,
        aiGenerationId: generation.id,
        purpose: 'jd.structure',
        model: 'claude-opus-5-5',
        promptVersion: 'v1',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0.001,
        latencyMs: 1,
      },
    });
    const artifact = await createArtifact(tx, {
      agencyId,
      kind: 'structured_jd',
      subject: { type: 'position', id: position.id },
    });
    const version = await addDraftVersion(tx, {
      agencyId,
      artifactId: artifact.id,
      content: { title: `${label} secret title` },
      origin: 'ai',
      createdById: userId,
      aiGenerationId: generation.id,
    });
    const file = await storeOriginal(tx, {
      agencyId,
      filename: `${label}.pdf`,
      bytes: makePdf([`${label} secret resume`]),
      createdById: userId,
    });
    await tx.membership.create({ data: { agencyId, userId: memberUserId, role: 'admin' } });
    const invite = await tx.memberInvite.create({
      data: {
        agencyId,
        email: `${label}@invite.test`,
        role: 'recruiter',
        tokenHash: hashToken(randomUUID()),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: userId,
      },
    });
    const outbox = await createOutboxMessage(tx, {
      agencyId,
      senderId: userId,
      toAddress: `${label}@mail.test`,
      subject: `${label} subject`,
      bodyText: 'secret body',
      bodyHtml: '<p>secret body</p>',
      kind: 'member_invite',
    });
    await tx.activityLog.create({
      data: {
        agencyId,
        actorType: 'user',
        actorId: userId,
        action: 'seed',
        entityType: 'client',
        entityId: client.id,
      },
    });

    return {
      agencyId,
      userId,
      clientId: client.id,
      positionId: position.id,
      candidateId: candidate.id,
      entryId: entry.id,
      artifactId: artifact.id,
      versionId: version.id,
      fileId: file.id,
      inviteId: invite.id,
      memberUserId,
      outboxId: outbox.id,
      generationId: generation.id,
    };
  });
}
