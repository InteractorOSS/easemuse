// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ArtifactKind } from '@easemuse/core';
import { getEnv } from '@/lib/env';
import { enqueue } from '@/lib/queue';

/** The artifact kinds whose approval is followed by indexing (ADR-008). */
export const EMBEDDED_KINDS = ['candidate_profile', 'success_profile'] as const;
export type EmbeddedKind = (typeof EMBEDDED_KINDS)[number];

export function isEmbeddedKind(kind: ArtifactKind): kind is EmbeddedKind {
  return (EMBEDDED_KINDS as readonly string[]).includes(kind);
}

export interface EmbedJobData {
  kind: EmbeddedKind;
  subjectId: string;
  versionId: string;
}

export type EmbeddingScheduler = (
  agencyId: string,
  data: EmbedJobData,
  options?: { idempotencySuffix?: string },
) => Promise<void>;

/**
 * Queues the indexing job. This is the single documented exception to "AI only on request"
 * (FR-AI-01, ADR-008): indexing computes a vector of content a recruiter has just approved. It
 * decides nothing and writes no draft. A failure to queue never blocks the approval: the nightly
 * catch-up indexes whatever was missed.
 */
const queueEmbedding: EmbeddingScheduler = async (agencyId, data, options) => {
  await enqueue({
    queue: 'indexing',
    name: 'embed',
    agencyId,
    requestedById: null,
    data,
    idempotencyKey: `embed:${data.versionId}${options?.idempotencySuffix ?? ''}`,
  });
};

let scheduler: EmbeddingScheduler | null = null;
let overridden = false;

/** Tests replace the scheduler (or pass null to turn it off). */
export function setEmbeddingScheduler(next: EmbeddingScheduler | null): void {
  scheduler = next;
  overridden = true;
}

export function resetEmbeddingScheduler(): void {
  scheduler = null;
  overridden = false;
}

/** Called by the approval hook of the artifact module. Never throws. */
export async function scheduleEmbeddingAfterApproval(
  agencyId: string,
  data: EmbedJobData,
): Promise<void> {
  const run = overridden ? scheduler : getEnv().NODE_ENV === 'test' ? null : queueEmbedding;
  if (!run) return;
  try {
    await run(agencyId, data);
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: 'embedding.schedule_failed',
        versionId: data.versionId,
        error: (error as Error).message,
      }),
    );
  }
}

export { queueEmbedding };
