// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT

/**
 * MFA detection from OIDC claims (T-F-24, FR-PLT-01, NFR-S01). RFC 8176 `amr` values that prove a
 * second factor, plus an `acr` that names MFA. Whether the Account Server emits these claims is
 * unconfirmed (risk TR-011), so enforcement is staged by `MFA_ENFORCEMENT`: off | log | enforce.
 */
const SECOND_FACTOR_AMR = new Set(['mfa', 'otp', 'totp', 'hwk', 'swk', 'sms', 'fpt', 'pop']);

export function hasMfa(claims: { amr?: unknown; acr?: unknown }): boolean {
  if (Array.isArray(claims.amr) && claims.amr.some((v) => SECOND_FACTOR_AMR.has(String(v)))) {
    return true;
  }
  return typeof claims.acr === 'string' && /mfa|multi/i.test(claims.acr);
}

export type MfaEnforcement = 'off' | 'log' | 'enforce';

/** Outcome of the MFA check for one request. */
export function mfaDecision(input: {
  enforcement: MfaEnforcement;
  mfa: boolean;
}): 'allow' | 'allow_and_log' | 'deny' {
  if (input.mfa || input.enforcement === 'off') return 'allow';
  return input.enforcement === 'enforce' ? 'deny' : 'allow_and_log';
}
