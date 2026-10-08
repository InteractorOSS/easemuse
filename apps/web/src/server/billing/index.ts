// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getEnv } from '@/lib/env';
import { getServiceToken } from '@/lib/interactor/service-token';
import { billingServerUrl } from '@/lib/interactor/service-urls';
import { createRecordingBillingFake } from './fake';
import { createHttpBillingClient } from './http-client';
import type { BillingClient } from './types';

export { BILLING_METRICS } from './metrics';
export type { BillingClient } from './types';

let processClient: BillingClient | undefined;
let override: BillingClient | null | undefined;

/** Tests choose the client (or none) directly. Pass `undefined` to go back to the configuration. */
export function setBillingClientForTests(client: BillingClient | null | undefined): void {
  override = client;
}

export type BillingMode = 'off' | 'fake' | 'live';
export const billingMode = (): BillingMode => getEnv().BILLING_MODE;

/**
 * The Billing Server client chosen by `BILLING_MODE`: `off` (default) means billing is not connected
 * and the callers say so; `fake` is an in-memory stand-in for development (one process only); `live`
 * calls the real server with an Account Server service token (needs INTERACTOR_AUTH_CLIENT_ID and
 * INTERACTOR_AUTH_CLIENT_SECRET).
 */
export function getBillingClient(): BillingClient | null {
  if (override !== undefined) return override;
  const mode = billingMode();
  if (mode === 'off') return null;
  processClient ??=
    mode === 'fake'
      ? createRecordingBillingFake()
      : createHttpBillingClient({ baseUrl: billingServerUrl, getToken: getServiceToken });
  return processClient;
}
