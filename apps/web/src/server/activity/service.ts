// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ScopedTx } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { decodeCursor, pageQuerySchema, toPage } from '@/lib/http/pagination';

/**
 * The activity log (T-0-02, US-007): an append-only record of what happened to an entity, shown as
 * its timeline. Write through `logActivity` inside the SAME transaction as the change it records.
 * `data` holds ids, statuses and counts, never document or message content.
 */
export interface ActivityInput {
  agencyId: string;
  actor: { type: 'user' | 'portal_user' | 'platform_admin' | 'system'; id?: string | null };
  /** Dot-namespaced, for example `pipeline.transition` or `artifact.approved`. */
  action: string;
  entityType: string;
  entityId: string;
  data?: Record<string, unknown>;
}

export async function logActivity(
  tx: Pick<ScopedTx, 'activityLog'>,
  input: ActivityInput,
): Promise<void> {
  await tx.activityLog.create({
    data: {
      agencyId: input.agencyId,
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.data ? { data: input.data as Prisma.InputJsonValue } : {}),
    },
  });
}

export const timelineQuerySchema = pageQuerySchema.extend({
  entityType: z.string().trim().min(1).max(40),
  entityId: z.guid(),
});

export interface TimelineEntry {
  id: string;
  action: string;
  actorType: string;
  /** Display name for a person; null for the system or when the user no longer exists. */
  actorName: string | null;
  data: unknown;
  createdAt: Date;
}

/** One page of an entity's timeline, newest first. The agency in scope is the only one visible (RLS). */
export async function listTimeline(
  tx: ScopedTx,
  input: z.output<typeof timelineQuerySchema>,
): Promise<{ items: TimelineEntry[]; nextCursor: string | null }> {
  const key = input.cursor ? decodeCursor(input.cursor) : undefined;
  const at = key ? new Date(key.v) : undefined;
  if (at && Number.isNaN(at.getTime())) {
    throw new ApiError('invalid_input', 'Invalid cursor', {
      status: 422,
      fields: { cursor: 'Invalid cursor' },
    });
  }
  const rows = await tx.activityLog.findMany({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      ...(key && at
        ? { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: key.id } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
  });
  const page = toPage(rows, input.limit, (r) => ({ v: r.createdAt.toISOString(), id: r.id }));
  const userIds = [
    ...new Set(page.items.flatMap((r) => (r.actorType === 'user' && r.actorId ? [r.actorId] : []))),
  ];
  const users = userIds.length
    ? await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  return {
    items: page.items.map((r) => ({
      id: r.id,
      action: r.action,
      actorType: r.actorType,
      actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      data: r.data,
      createdAt: r.createdAt,
    })),
    nextCursor: page.nextCursor,
  };
}
