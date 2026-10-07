// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { CreateAgencyInput, PlatformAdminActor } from '@easemuse/core';
import { resolveLocale } from '@/i18n/config';
import {
  findAgenciesPage,
  getAgencyByRef,
  getAgencyListItem,
  withAgency,
  type AgencyListItem,
  type AgencyRef,
} from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError, notFound } from '@/lib/http/errors';
import { decodeCursor, encodeCursor, toPage } from '@/lib/http/pagination';
import { createOutboxMessage, dispatchOutboxMessage } from '@/server/messaging/outbox';
import { renderMemberInviteEmail } from '@/server/messaging/templates';
import { recordPlatformAudit } from '@/server/platform/audit';
import { INVITE_TTL_DAYS, inviteExpiry, newInviteToken } from './tokens';
import { hashToken } from './invites';
import { randomUUID } from 'node:crypto';

export interface AgencySummary extends AgencyListItem {
  activeMembers: number;
}

export interface AgencyDetail extends AgencySummary {
  pendingInvites: number;
}

/** Counts through the agency's own scope: /admin never reads another agency's rows directly (RLS). */
async function counts(agencyId: string) {
  return withAgency(agencyId, async (tx) => {
    const now = new Date();
    const [activeMembers, pendingInvites] = await Promise.all([
      tx.membership.count({ where: { agencyId, active: true } }),
      tx.memberInvite.count({
        where: { agencyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      }),
    ]);
    return { activeMembers, pendingInvites };
  });
}

export async function listAgencies(input: {
  q?: string | undefined;
  status?: AgencyRef['status'] | undefined;
  limit: number;
  cursor?: string | undefined;
}): Promise<{ items: AgencySummary[]; nextCursor: string | null }> {
  const key = input.cursor ? decodeCursor(input.cursor) : undefined;
  const after = key ? { createdAt: new Date(key.v), id: key.id } : undefined;
  if (after && Number.isNaN(after.createdAt.getTime())) {
    throw new ApiError('invalid_input', 'Invalid cursor', { fields: { cursor: 'Invalid cursor' } });
  }
  const rows = await findAgenciesPage({
    q: input.q,
    status: input.status,
    limit: input.limit,
    after,
  });
  const page = toPage(rows, input.limit, (r) => ({ v: r.createdAt.toISOString(), id: r.id }));
  const items = await Promise.all(
    page.items.map(async (agency) => ({
      ...agency,
      activeMembers: (await counts(agency.id)).activeMembers,
    })),
  );
  return { items, nextCursor: page.nextCursor };
}

export async function getAgencyDetail(ref: string): Promise<AgencyDetail> {
  const agency = await getAgencyListItem(ref);
  if (!agency) throw notFound('Agency');
  return { ...agency, ...(await counts(agency.id)) };
}

const isUniqueViolation = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === 'P2002';

/**
 * Creates an agency and its first admin invitation in ONE transaction, with the platform audit
 * entry and the outbox email (US-1602, FR-TEN-02). The email is queued for delivery after commit.
 */
export async function createAgencyWithAdmin(
  input: CreateAgencyInput,
  actor: PlatformAdminActor,
  inviterName: string,
): Promise<{ agency: AgencyRef; inviteExpiresAt: Date }> {
  const agencyId = randomUUID();
  const adminEmail = input.adminEmail.toLowerCase();
  const token = newInviteToken();
  const expiresAt = inviteExpiry();
  const acceptUrl = `${getEnv().APP_URL.replace(/\/+$/, '')}/invite/${input.slug}?token=${token}`;
  const locale = resolveLocale({});
  const mail = await renderMemberInviteEmail({
    locale,
    agencyName: input.name,
    inviterName,
    role: 'admin',
    acceptUrl,
    days: INVITE_TTL_DAYS,
  });

  let outboxMessageId: string;
  try {
    outboxMessageId = await withAgency(agencyId, async (tx) => {
      await tx.agency.create({
        data: {
          id: agencyId,
          slug: input.slug,
          name: input.name,
          region: input.region,
          status: 'active',
        },
      });
      const invite = await tx.memberInvite.create({
        data: {
          agencyId,
          email: adminEmail,
          role: 'admin',
          tokenHash: hashToken(token),
          expiresAt,
          invitedById: actor.userId,
        },
      });
      const outbox = await createOutboxMessage(tx, {
        agencyId,
        senderId: actor.userId,
        toAddress: adminEmail,
        subject: mail.subject,
        bodyText: mail.text,
        bodyHtml: mail.html,
        kind: 'member_invite',
        entityType: 'member_invite',
        entityId: invite.id,
      });
      await recordPlatformAudit(tx, {
        adminId: actor.userId,
        action: 'agency.create',
        agencyId,
        targetType: 'agency',
        targetId: agencyId,
        data: { slug: input.slug, region: input.region },
      });
      return outbox.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError('slug_taken', 'This URL name is already taken', {
        status: 409,
        fields: { slug: 'Already taken' },
      });
    }
    throw error;
  }

  await dispatchOutboxMessage({ agencyId, outboxMessageId, requestedById: actor.userId }).catch(
    (error) =>
      // The message stays queued in the outbox; a sweeper will pick it up (see messaging docs).
      console.error('[messaging] could not queue invitation email', (error as Error).message),
  );
  return {
    agency: { id: agencyId, slug: input.slug, name: input.name, status: 'active' },
    inviteExpiresAt: expiresAt,
  };
}

/**
 * Suspends or reactivates an agency (US-1602, ADR-012). Data is untouched; sign-in, API access and
 * background jobs check `status`. A reason is required and kept in the platform audit log.
 */
export async function setAgencyStatus(
  agencyRef: string,
  to: 'suspended' | 'active',
  reason: string,
  actor: PlatformAdminActor,
): Promise<AgencyRef> {
  const agency = await getAgencyByRef(agencyRef);
  if (!agency) throw notFound('Agency');
  if (agency.status === 'closed')
    throw new ApiError('conflict', 'A closed agency cannot be changed', { status: 409 });
  if (agency.status === to || (to === 'active' && agency.status === 'trial')) {
    throw new ApiError('conflict', `The agency is already ${agency.status}`, { status: 409 });
  }
  return withAgency(agency.id, async (tx) => {
    const updated = await tx.agency.update({
      where: { id: agency.id },
      data: { status: to },
      select: { id: true, slug: true, name: true, status: true },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: to === 'suspended' ? 'agency.suspend' : 'agency.reactivate',
      agencyId: agency.id,
      targetType: 'agency',
      targetId: agency.id,
      data: { reason, from: agency.status },
    });
    return updated;
  });
}
