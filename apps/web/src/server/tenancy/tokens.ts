// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. Only its hash is stored (ADR-002); the plaintext goes in the email link. */
export function newInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Invitation lifetime (ADR-002): 7 days. */
export const INVITE_TTL_DAYS = 7;

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
