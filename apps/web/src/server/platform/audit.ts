// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ScopedTx } from '@/lib/db';

/**
 * Appends to the platform audit log (FR-ADM-06). Call it with the SAME transaction as the action it
 * records, so an action and its log entry commit or roll back together (architecture §5.6).
 * `data` is a summary only and must never hold candidate or client content.
 */
export async function recordPlatformAudit(
  tx: Pick<ScopedTx, 'platformAuditLog'>,
  entry: {
    adminId: string;
    action: string;
    agencyId?: string | null;
    targetType?: string | null;
    targetId?: string | null;
    data?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await tx.platformAuditLog.create({
    data: {
      adminId: entry.adminId,
      action: entry.action,
      agencyId: entry.agencyId ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      ...(entry.data ? { data: entry.data } : {}),
    },
  });
}
