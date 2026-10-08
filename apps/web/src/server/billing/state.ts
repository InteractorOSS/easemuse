// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { z } from 'zod';

/**
 * What `Agency.billing` holds: the last plan state read from Billing Server. It is a cache for
 * display and for the seat limit, refreshed daily, on a plan change and on request. Billing Server is
 * the source of truth for money; nothing here decides what an agency pays.
 */
export const billingStateSchema = z.object({
  planId: z.string().optional(),
  planName: z.string().optional(),
  planRole: z.string().optional(),
  subscriptionId: z.string().optional(),
  status: z.string().optional(),
  /** The hard limit on the seats metric, or null for none. Enforced when inviting. */
  seatLimit: z.number().int().min(0).nullable().default(null),
  syncedAt: z.string().optional(),
  /** Set when the last sync could not read the server; the plan fields above are then older. */
  error: z.string().nullable().default(null),
});
export type BillingState = z.infer<typeof billingStateSchema>;

/** Reads the stored JSON leniently; anything invalid is an agency with no known plan. */
export function parseBillingState(raw: unknown): BillingState {
  const result = billingStateSchema.safeParse(raw ?? {});
  return result.success ? result.data : billingStateSchema.parse({});
}
