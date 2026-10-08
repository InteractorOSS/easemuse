// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyActor, AgencyRole, InviteMemberInput, UpdateMemberInput } from '@easemuse/core';
import { resolveLocale } from '@/i18n/config';
import { findUserByEmail, getAgencyDefaultLocale, getPlatformUser, withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError, notFound } from '@/lib/http/errors';
import { decodeCursor, toPage } from '@/lib/http/pagination';
import { createOutboxMessage, dispatchOutboxMessage } from '@/server/messaging/outbox';
import { loadBrand } from '@/server/branding/brand';
import { renderMemberInviteEmail } from '@/server/messaging/templates';
import { hashToken } from './invites';
import { INVITE_TTL_DAYS, inviteExpiry, newInviteToken } from './tokens';

export interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: AgencyRole;
  active: boolean;
  createdAt: Date;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: AgencyRole;
  expiresAt: Date;
  createdAt: Date;
}

export async function listMembers(
  actor: AgencyActor,
  input: { limit: number; cursor?: string | undefined },
): Promise<{ items: Member[]; nextCursor: string | null }> {
  const key = input.cursor ? decodeCursor(input.cursor) : undefined;
  const rows = await withAgency(
    actor.agencyId,
    (tx) =>
      tx.membership.findMany({
        where: {
          agencyId: actor.agencyId,
          ...(key
            ? {
                OR: [
                  { createdAt: { gt: new Date(key.v) } },
                  { createdAt: new Date(key.v), id: { gt: key.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: input.limit + 1,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
    { userId: actor.userId },
  );
  const page = toPage(rows, input.limit, (r) => ({ v: r.createdAt.toISOString(), id: r.id }));
  return {
    items: page.items.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      role: r.role,
      active: r.active,
      createdAt: r.createdAt,
    })),
    nextCursor: page.nextCursor,
  };
}

/**
 * Changes a member's role or active flag (FR-TEN-03). An agency must always keep one active admin:
 * demoting or deactivating the last one is refused (409 `last_admin`). Logged to the activity log.
 */
export async function updateMember(
  actor: AgencyActor,
  userId: string,
  input: UpdateMemberInput,
): Promise<Member> {
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const target = await tx.membership.findUnique({
        where: { agencyId_userId: { agencyId: actor.agencyId, userId } },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (!target) throw notFound('Member');

      const newRole = input.role ?? target.role;
      const newActive = input.active ?? target.active;
      const losesAdmin =
        target.role === 'admin' && target.active && (newRole !== 'admin' || !newActive);
      if (losesAdmin) {
        const activeAdmins = await tx.membership.count({
          where: { agencyId: actor.agencyId, role: 'admin', active: true },
        });
        if (activeAdmins <= 1) {
          throw new ApiError('last_admin', 'An agency needs at least one active admin', {
            status: 409,
          });
        }
      }

      const updated = await tx.membership.update({
        where: { id: target.id },
        data: { role: newRole, active: newActive },
      });
      await tx.activityLog.create({
        data: {
          agencyId: actor.agencyId,
          actorType: 'user',
          actorId: actor.userId,
          action: 'member.updated',
          entityType: 'membership',
          entityId: target.id,
          data: {
            from: { role: target.role, active: target.active },
            to: { role: newRole, active: newActive },
          },
        },
      });
      return {
        userId,
        name: target.user.name,
        email: target.user.email,
        role: updated.role,
        active: updated.active,
        createdAt: updated.createdAt,
      };
    },
    { userId: actor.userId },
  );
}

const pendingWhere = (agencyId: string, now: Date) => ({
  agencyId,
  acceptedAt: null,
  revokedAt: null,
  expiresAt: { gt: now },
});

export async function listPendingInvites(actor: AgencyActor): Promise<PendingInvite[]> {
  return withAgency(
    actor.agencyId,
    (tx) =>
      tx.memberInvite.findMany({
        where: pendingWhere(actor.agencyId, new Date()),
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      }),
    { userId: actor.userId },
  );
}

/**
 * Invites someone to the agency (FR-TEN-02): stores only the token hash, queues the email through
 * the outbox, and refuses duplicates (409 `invite_already_pending`, 409 `already_member`).
 */
export async function createInvite(
  actor: AgencyActor,
  agency: { slug: string; name: string },
  input: InviteMemberInput,
): Promise<PendingInvite> {
  const email = input.email.toLowerCase();
  const [inviter, existingUser, agencyLocale] = await Promise.all([
    getPlatformUser(actor.userId),
    findUserByEmail(email),
    getAgencyDefaultLocale(actor.agencyId),
  ]);
  const token = newInviteToken();
  const expiresAt = inviteExpiry();
  const baseUrl = getEnv().APP_URL.replace(/\/+$/, '');
  const acceptUrl = `${baseUrl}/invite/${agency.slug}?token=${token}`;
  const brand = await withAgency(actor.agencyId, (tx) => loadBrand(tx, actor.agencyId, baseUrl), {
    userId: actor.userId,
  });
  const mail = await renderMemberInviteEmail({
    locale: resolveLocale({ agencyLocale }),
    agencyName: agency.name,
    inviterName: inviter?.name ?? inviter?.email ?? agency.name,
    role: input.role,
    acceptUrl,
    days: INVITE_TTL_DAYS,
    brand,
  });

  const { invite, outboxId } = await withAgency(
    actor.agencyId,
    async (tx) => {
      if (existingUser) {
        const member = await tx.membership.findUnique({
          where: { agencyId_userId: { agencyId: actor.agencyId, userId: existingUser.id } },
        });
        if (member?.active)
          throw new ApiError('already_member', 'This person is already a member', { status: 409 });
      }
      const pending = await tx.memberInvite.findFirst({
        where: {
          ...pendingWhere(actor.agencyId, new Date()),
          email: { equals: email, mode: 'insensitive' },
        },
      });
      if (pending)
        throw new ApiError(
          'invite_already_pending',
          'This person already has a pending invitation',
          { status: 409 },
        );

      const created = await tx.memberInvite.create({
        data: {
          agencyId: actor.agencyId,
          email,
          role: input.role,
          tokenHash: hashToken(token),
          expiresAt,
          invitedById: actor.userId,
        },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      });
      const outbox = await createOutboxMessage(tx, {
        agencyId: actor.agencyId,
        senderId: actor.userId,
        toAddress: email,
        subject: mail.subject,
        bodyText: mail.text,
        bodyHtml: mail.html,
        kind: 'member_invite',
        entityType: 'member_invite',
        entityId: created.id,
      });
      await tx.activityLog.create({
        data: {
          agencyId: actor.agencyId,
          actorType: 'user',
          actorId: actor.userId,
          action: 'member.invited',
          entityType: 'member_invite',
          entityId: created.id,
          data: { role: input.role },
        },
      });
      return { invite: created, outboxId: outbox.id };
    },
    { userId: actor.userId },
  );

  await dispatchOutboxMessage({
    agencyId: actor.agencyId,
    outboxMessageId: outboxId,
    requestedById: actor.userId,
  }).catch((error) =>
    console.error('[messaging] could not queue invitation email', (error as Error).message),
  );
  return invite;
}

/** Revokes a pending invitation so its link stops working. Used or unknown invites are 404. */
export async function revokeInvite(actor: AgencyActor, inviteId: string): Promise<void> {
  await withAgency(
    actor.agencyId,
    async (tx) => {
      const result = await tx.memberInvite.updateMany({
        where: { id: inviteId, agencyId: actor.agencyId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) throw notFound('Invite');
      await tx.activityLog.create({
        data: {
          agencyId: actor.agencyId,
          actorType: 'user',
          actorId: actor.userId,
          action: 'member.invite_revoked',
          entityType: 'member_invite',
          entityId: inviteId,
        },
      });
    },
    { userId: actor.userId },
  );
}
