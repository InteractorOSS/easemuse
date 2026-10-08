// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/** An export is built in memory, so it has a ceiling; a larger tenant is exported by Team of Wakers. */
export const TENANT_EXPORT_MAX_BYTES = 512 * 1024 * 1024;
/** Completed exports kept per agency; older ones are removed when a new one finishes. */
export const TENANT_EXPORTS_KEPT = 2;

export const TENANT_EXPORT_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export type TenantExportStatus = (typeof TENANT_EXPORT_STATUSES)[number];

export const TENANT_DELETION_STATUSES = [
  'requested',
  'approved',
  'running',
  'completed',
  'failed',
  'cancelled',
] as const;
export type TenantDeletionStatus = (typeof TENANT_DELETION_STATUSES)[number];

/**
 * `POST /api/admin/v1/agencies/:id/deletion` and `.../deletion/:deletionId/approve` (FR-ADM-08): the
 * person types the agency's URL name to confirm. Both the requester and the approver do.
 */
export const tenantDeletionConfirmSchema = z.object({
  confirmSlug: z.string().trim().min(1).max(60),
});
export type TenantDeletionConfirmInput = z.infer<typeof tenantDeletionConfirmSchema>;
