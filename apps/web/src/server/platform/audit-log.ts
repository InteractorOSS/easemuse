// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';
import { findAuditPage, type AuditEntry } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
import { decodeCursor, pageQuerySchema, toPage } from '@/lib/http/pagination';

export const auditQuerySchema = pageQuerySchema.extend({
  adminId: z.guid().optional(),
  agencyId: z.guid().optional(),
  action: z.string().trim().max(60).optional(),
});

/** Searchable platform audit log (FR-ADM-06): who did what, when, to which agency. */
export async function listAuditEntries(
  input: z.output<typeof auditQuerySchema>,
): Promise<{ items: AuditEntry[]; nextCursor: string | null }> {
  const key = input.cursor ? decodeCursor(input.cursor) : undefined;
  const after = key ? { createdAt: new Date(key.v), id: key.id } : undefined;
  if (after && Number.isNaN(after.createdAt.getTime())) {
    throw new ApiError('invalid_input', 'Invalid cursor', { fields: { cursor: 'Invalid cursor' } });
  }
  const rows = await findAuditPage({
    adminId: input.adminId,
    agencyId: input.agencyId,
    action: input.action,
    limit: input.limit,
    after,
  });
  return toPage(rows, input.limit, (r) => ({ v: r.createdAt.toISOString(), id: r.id }));
}
