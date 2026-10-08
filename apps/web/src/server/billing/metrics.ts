// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * What EaseMuse reports to Billing Server, and how a plan refers to it. The names below must exist as
 * metrics on the plans Team of Wakers sets up in Billing Server (see docs/planning/billing.md); they are
 * the only place that knows them.
 */
export const BILLING_METRICS = {
  /**
   * AI cost in whole US cents, month to date. Reported as the growth since the last report, so a
   * month adds up to the ledger's `LlmCall` total (rounded down to a cent, the remainder carries over).
   */
  aiCostCents: 'ai_cost_cents',
  /**
   * Active seats (members who can sign in), reported once a day as a snapshot. The plan decides how a
   * month of snapshots is billed (for example by the highest day); it also carries the seat LIMIT, a
   * hard limit on this metric, which EaseMuse reads back and enforces when inviting.
   */
  seats: 'seats',
} as const;

/** Billing Server's subscriber type for an agency. To confirm with the server's owners (ADR-014). */
export const AGENCY_SUBSCRIBER_TYPE = 'organization';
