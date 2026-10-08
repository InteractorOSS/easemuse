// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * The Interactor Billing Server as EaseMuse uses it (T-13-08, FR-TEN-05, ADR-013, ADR-014). The rest
 * of the app talks to this interface only, so the live server, the recording fake and any later
 * change to the server's wire format stay in one place (`billing/`).
 *
 * Every agency is one billing **subscriber**; its id is the agency's id. Billing Server holds the
 * plan, the invoices and the usage counters; EaseMuse reports usage after the fact and reads plan
 * state back. There is no pre-flight quota call (the server has none): AI spend is gated locally by
 * the agency's monthly budget, and the seat limit is enforced locally from the last synced plan.
 */

export interface BillingPlan {
  id: string;
  /** The vendor-scoped stable key (for example `easemuse_team`), when the server sends one. */
  role: string | null;
  name: string;
  basePrice: string | null;
  currency: string | null;
  billingPeriod: string | null;
  metrics: {
    name: string;
    displayName: string;
    limit: number | null;
    limitType: 'hard' | 'soft' | null;
  }[];
}

export interface BillingSubscription {
  id: string;
  planId: string;
  status: string;
}

export interface BillingLimit {
  metric: string;
  limit: number | null;
  used: number;
  type: 'hard' | 'soft' | 'unlimited';
}

export interface BillingSubscriptionState {
  subscription: BillingSubscription | null;
  limits: BillingLimit[];
}

export interface BillingInvoice {
  id: string;
  kind: string;
  amount: string;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
  paidAt: string | null;
}

export interface UsageReport {
  agencyId: string;
  metric: string;
  /** A whole number of the metric's unit. */
  quantity: number;
  /** The server ignores a second report with the same key, so a retry never double counts. */
  idempotencyKey: string;
}

/** A call the server refused or could not answer. `status` is the HTTP status, 0 for no answer. */
export class BillingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export interface BillingClient {
  readonly name: 'live' | 'fake';
  /** The plans an agency can be put on. */
  listPlans(): Promise<BillingPlan[]>;
  /** The agency's subscription and limits, or null when the server could not be read (not the same as "none"). */
  getState(agencyId: string): Promise<BillingSubscriptionState | null>;
  /** Puts the agency on a plan. `already_exists` means it already is on that plan: also a success. */
  createSubscription(
    agencyId: string,
    planId: string,
  ): Promise<{ status: 'created'; subscriptionId: string } | { status: 'already_exists' }>;
  /** Throws `BillingError` when the report did not reach the server. */
  reportUsage(report: UsageReport): Promise<void>;
  /** Newest first, or null when the server could not be read. */
  listInvoices(agencyId: string): Promise<BillingInvoice[] | null>;
}
