// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** A support grant lasts at most this long (ADR-012). */
export const SUPPORT_MAX_HOURS = 72;
export const SUPPORT_DEFAULT_HOURS = 24;
/** A request nobody decided on lapses after this many days. */
export const SUPPORT_REQUEST_TTL_DAYS = 7;

/** `POST /api/admin/v1/agencies/:id/support-access`: a platform administrator asks to look (FR-ADM-07). */
export const supportAccessRequestSchema = z.object({
  reason: z.string().trim().min(10, 'Say why in at least 10 characters').max(500),
  hours: z.number().int().min(1).max(SUPPORT_MAX_HOURS).default(SUPPORT_DEFAULT_HOURS),
});
export type SupportAccessRequestInput = z.infer<typeof supportAccessRequestSchema>;

/** `POST /api/v1/agencies/:id/support-access/:grantId/decision`: an agency admin decides (FR-TEN-07). */
export const SUPPORT_DECISIONS = ['approve', 'deny', 'revoke'] as const;
export const supportDecisionSchema = z.object({ decision: z.enum(SUPPORT_DECISIONS) });
export type SupportDecisionInput = z.infer<typeof supportDecisionSchema>;

export type SupportGrantStatus = 'pending' | 'active' | 'expired' | 'denied' | 'revoked' | 'lapsed';

export interface SupportGrantFacts {
  grantedById: string | null;
  expiresAt: Date | null;
  deniedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Where a grant stands now. Only `active` lets anyone into the workspace. */
export function supportGrantStatus(grant: SupportGrantFacts, now: Date): SupportGrantStatus {
  if (grant.revokedAt) return 'revoked';
  if (grant.deniedAt) return 'denied';
  if (grant.grantedById && grant.expiresAt) return grant.expiresAt > now ? 'active' : 'expired';
  const lapsesAt = grant.createdAt.getTime() + SUPPORT_REQUEST_TTL_DAYS * 86_400_000;
  return lapsesAt > now.getTime() ? 'pending' : 'lapsed';
}
