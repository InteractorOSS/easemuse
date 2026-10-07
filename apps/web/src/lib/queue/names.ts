// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** Queues (architecture §5.7). */
export const QUEUE_NAMES = ['ai', 'documents', 'messaging', 'indexing', 'maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

/** Queues whose jobs may run without an agency (scheduled, platform-wide work). */
export const SYSTEM_QUEUES: readonly QueueName[] = ['maintenance'];

const guid = z.guid();

/**
 * What every job carries. The worker opens an agency-scoped database context from `agencyId`
 * before any query (ADR-001), so agency queues refuse a payload without one.
 */
export const jobPayloadSchema = z.object({
  jobRunId: guid,
  agencyId: guid.nullable(),
  requestedById: guid.nullable(),
  data: z.unknown(),
});
export type JobPayload = z.infer<typeof jobPayloadSchema>;
