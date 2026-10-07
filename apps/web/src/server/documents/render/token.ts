// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long a render link works: long enough for a slow page, short enough to be useless if leaked. */
export const RENDER_TOKEN_TTL_SEC = 120;

const sign = (secret: string, agencyId: string, versionId: string, exp: number) =>
  createHmac('sha256', secret).update(`render:${agencyId}:${versionId}:${exp}`).digest('base64url');

/**
 * A signed, expiring token for the print route (ADR-011: "worker-only auth"). It is bound to one
 * agency and one version, so it opens nothing else.
 */
export function signRenderToken(input: {
  secret: string;
  agencyId: string;
  versionId: string;
  now?: number;
  ttlSec?: number;
}): string {
  const exp = Math.floor((input.now ?? Date.now()) / 1000) + (input.ttlSec ?? RENDER_TOKEN_TTL_SEC);
  return `${exp}.${sign(input.secret, input.agencyId, input.versionId, exp)}`;
}

export function verifyRenderToken(input: {
  secret: string;
  agencyId: string;
  versionId: string;
  token: string | undefined | null;
  now?: number;
}): boolean {
  const [expText, signature] = (input.token ?? '').split('.');
  const exp = Number(expText);
  if (!signature || !Number.isInteger(exp)) return false;
  if (exp < Math.floor((input.now ?? Date.now()) / 1000)) return false;
  const expected = Buffer.from(sign(input.secret, input.agencyId, input.versionId, exp));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
