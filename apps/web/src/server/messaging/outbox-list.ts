// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { OUTBOX_STATUSES } from '@easemuse/core';
import type { ScopedTx } from '@/lib/db';
import { decodeCursor, pageQuerySchema, toPage } from '@/lib/http/pagination';

export const outboxQuerySchema = pageQuerySchema.extend({
  status: z.enum(OUTBOX_STATUSES).optional(),
});
export type OutboxQuery = z.infer<typeof outboxQuerySchema>;

export interface OutboxItem {
  id: string;
  toAddress: string;
  subject: string;
  bodyText: string;
  kind: string;
  transport: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

/**
 * Everything the agency's mail went through (T-5-04, FR-MSG-02), newest first. With the dev-capture
 * transport this is the inbox where test messages end up. Admin only (the route checks).
 */
export async function listOutbox(
  tx: ScopedTx,
  query: OutboxQuery,
): Promise<{ items: OutboxItem[]; nextCursor: string | null }> {
  const after = query.cursor ? decodeCursor(query.cursor) : null;
  const rows = await tx.outboxMessage.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(after
        ? {
            OR: [
              { createdAt: { lt: new Date(after.v) } },
              { createdAt: new Date(after.v), id: { lt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    select: {
      id: true,
      toAddress: true,
      subject: true,
      bodyText: true,
      kind: true,
      transport: true,
      status: true,
      attempts: true,
      lastError: true,
      sentAt: true,
      createdAt: true,
    },
  });
  return toPage(rows, query.limit, (r) => ({ v: r.createdAt.toISOString(), id: r.id }));
}
