// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ScopedTx } from '@/lib/db';
import { logActivity } from '@/server/activity/service';

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(`unsubscribe:${payload}`).digest('base64url');

/**
 * A signed link for the "stop emailing me" footer (FR-MSG-05). It names one agency and one address,
 * never expires (people click old emails) and opens nothing else.
 */
export function signUnsubscribeToken(input: {
  secret: string;
  agencyId: string;
  address: string;
}): string {
  const payload = Buffer.from(`${input.agencyId}|${input.address.toLowerCase()}`).toString(
    'base64url',
  );
  return `${payload}.${sign(input.secret, payload)}`;
}

export function verifyUnsubscribeToken(
  secret: string,
  token: string,
): { agencyId: string; address: string } | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [agencyId, address] = Buffer.from(payload, 'base64url').toString('utf8').split('|');
  return agencyId && address ? { agencyId, address } : null;
}

export function unsubscribeUrl(input: {
  baseUrl: string;
  secret: string;
  agencyId: string;
  address: string;
}): string {
  return `${input.baseUrl.replace(/\/$/, '')}/api/public/unsubscribe/${signUnsubscribeToken(input)}`;
}

/**
 * Records that the address opted out (T-5-03): outreach to it is refused from now on, and every
 * candidate of the agency with that email is marked do not contact so drafting is blocked too.
 * Repeating it changes nothing.
 */
export async function applyUnsubscribe(
  tx: ScopedTx,
  agencyId: string,
  address: string,
): Promise<void> {
  const to = address.toLowerCase();
  await tx.suppression.upsert({
    where: { agencyId_address: { agencyId, address: to } },
    create: { agencyId, address: to, reason: 'opted_out' },
    update: {},
  });
  const candidates = await tx.candidate.findMany({
    where: { email: { equals: to, mode: 'insensitive' }, doNotContact: false },
    select: { id: true },
  });
  for (const c of candidates) {
    await tx.candidate.update({
      where: { id: c.id },
      data: {
        doNotContact: true,
        doNotContactReason: 'Opted out through the email link',
        doNotContactAt: new Date(),
      },
    });
    await logActivity(tx, {
      agencyId,
      actor: { type: 'system' },
      action: 'candidate.opted_out',
      entityType: 'candidate',
      entityId: c.id,
      data: {},
    });
  }
}
