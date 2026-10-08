// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PORTAL_SESSION_HOURS, type PortalAudienceValue } from '@easemuse/core';

/** Cookie of the portal session. Separate from the agency session on purpose (ADR-002). */
export const PORTAL_COOKIE = 'em_portal';

export interface PortalSession {
  portalUserId: string;
  agencyId: string;
  audience: PortalAudienceValue;
  /** Unix seconds. */
  exp: number;
}

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(`portal-session:${payload}`).digest('base64url');

/** A signed, expiring cookie value carrying who the portal user is and for which agency. */
export function signPortalSession(
  secret: string,
  input: Omit<PortalSession, 'exp'>,
  now: number = Date.now(),
): string {
  const exp = Math.floor(now / 1000) + PORTAL_SESSION_HOURS * 3600;
  const payload = Buffer.from(JSON.stringify({ ...input, exp })).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyPortalSession(
  secret: string,
  value: string | undefined | null,
  now: number = Date.now(),
): PortalSession | null {
  const [payload, signature] = (value ?? '').split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as PortalSession;
    if (
      typeof parsed.portalUserId !== 'string' ||
      typeof parsed.agencyId !== 'string' ||
      (parsed.audience !== 'hiring_manager' && parsed.audience !== 'candidate') ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Math.floor(now / 1000)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
