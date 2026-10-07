// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const PRIVACY_KINDS = ['export', 'delete'] as const;
export type PrivacyKind = (typeof PRIVACY_KINDS)[number];

export const PRIVACY_STATUSES = ['requested', 'in_progress', 'completed', 'rejected'] as const;
export type PrivacyStatus = (typeof PRIVACY_STATUSES)[number];

/**
 * Days to answer a candidate's request. 45 is the longest common U.S. state period (CCPA); Korea's
 * PIPA asks for 10, so counsel may shorten it per agency later (FR-PLT-08, open question Q-07).
 */
export const PRIVACY_DEADLINE_DAYS = 45;
/** The reminder task falls due this many days before the deadline. */
export const PRIVACY_REMINDER_DAYS = 7;

/** `POST /privacy-requests` (FR-PLT-08): the agency records a request it received. */
export const createPrivacyRequestInputSchema = z.object({
  candidateId: z.guid(),
  kind: z.enum(PRIVACY_KINDS),
  note: z.string().trim().max(1000).optional(),
});
export type CreatePrivacyRequestInput = z.infer<typeof createPrivacyRequestInputSchema>;

/** `POST /privacy-requests/:id/reject` */
export const rejectPrivacyRequestInputSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectPrivacyRequestInput = z.infer<typeof rejectPrivacyRequestInputSchema>;
