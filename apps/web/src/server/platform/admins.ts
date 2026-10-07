// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { InvitePlatformAdminInput, PlatformAdminActor, PlatformRole } from '@easemuse/core';
import { withUser, type ScopedTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { hashToken } from '@/server/tenancy/invites';
import { inviteExpiry, newInviteToken } from '@/server/tenancy/tokens';
import { recordPlatformAudit } from './audit';

/**
 * Platform administrators of Team of Wakers (US-1603, FR-ADM-04). Only owners manage them. These
 * live in platform tables (User, PlatformAdminInvite, PlatformAuditLog); there is no agency
 * context, so each action runs in a user-scoped transaction where tenant tables are invisible.
 */
export interface PlatformAdmin {
  userId: string;
  email: string;
  name: string | null;
  role: PlatformRole;
}

export interface PlatformAdminInviteView {
  id: string;
  email: string;
  role: PlatformRole;
  expiresAt: Date;
}

const lastOwner = () =>
  new ApiError('last_owner', 'The platform needs at least one owner', { status: 409 });

/** Locks the owner rows so two owners cannot demote each other at the same moment and leave none. */
async function lockOwners(tx: ScopedTx): Promise<number> {
  const owners = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "User" WHERE "platformRole" = 'owner' FOR UPDATE`;
  return owners.length;
}

export async function listPlatformAdmins(
  actor: PlatformAdminActor,
): Promise<{ admins: PlatformAdmin[]; invites: PlatformAdminInviteView[] }> {
  return withUser(actor.userId, async (tx) => {
    const [users, invites] = await Promise.all([
      tx.user.findMany({
        where: { platformRole: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, platformRole: true },
      }),
      tx.platformAdminInvite.findMany({
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, expiresAt: true },
      }),
    ]);
    return {
      admins: users.map((u) => ({
        userId: u.id,
        email: u.email,
        name: u.name,
        role: u.platformRole!,
      })),
      invites,
    };
  });
}

/**
 * Invites someone by email. There is no agency to send platform mail from yet, so the owner gets the
 * link to pass on; only its hash is stored. The invite is logged without the token.
 */
export async function invitePlatformAdmin(
  actor: PlatformAdminActor,
  input: InvitePlatformAdminInput,
): Promise<{ invite: PlatformAdminInviteView; acceptUrl: string }> {
  const email = input.email.toLowerCase();
  const token = newInviteToken();
  const expiresAt = inviteExpiry();
  const invite = await withUser(actor.userId, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, platformRole: { not: null } },
    });
    if (existing)
      throw new ApiError('already_admin', 'This person is already a platform administrator', {
        status: 409,
      });
    const pending = await tx.platformAdminInvite.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending)
      throw new ApiError('invite_already_pending', 'This person already has a pending invitation', {
        status: 409,
      });
    const created = await tx.platformAdminInvite.create({
      data: {
        email,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedById: actor.userId,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'admin.invite',
      targetType: 'platform_admin_invite',
      targetId: created.id,
      data: { role: input.role },
    });
    return created;
  });
  return {
    invite,
    acceptUrl: `${getEnv().APP_URL.replace(/\/+$/, '')}/admin-invite?token=${token}`,
  };
}

export async function revokePlatformAdminInvite(
  actor: PlatformAdminActor,
  inviteId: string,
): Promise<void> {
  await withUser(actor.userId, async (tx) => {
    const result = await tx.platformAdminInvite.deleteMany({
      where: { id: inviteId, acceptedAt: null },
    });
    if (result.count === 0) throw notFound('Invite');
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'admin.invite_revoked',
      targetType: 'platform_admin_invite',
      targetId: inviteId,
    });
  });
}

/**
 * Accepts an invitation as the signed-in user. The invite is single-use, expires after 7 days and is
 * bound to the invited email. Everything that is wrong with a token answers 404 except an expired
 * one (410) and a different email (403), as for agency invites.
 */
export async function acceptPlatformAdminInvite(input: {
  token: string;
  user: { id: string; email: string };
  now?: Date;
}): Promise<{ role: PlatformRole }> {
  const now = input.now ?? new Date();
  return withUser(input.user.id, async (tx) => {
    const invite = await tx.platformAdminInvite.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (!invite) throw notFound('Invite');
    if (invite.acceptedAt)
      throw new ApiError('invite_already_accepted', 'This invite was already used', {
        status: 409,
      });
    if (invite.expiresAt <= now)
      throw new ApiError('invite_expired', 'This invitation has expired', { status: 410 });
    if (invite.email.toLowerCase() !== input.user.email.toLowerCase())
      throw forbidden('This invitation was sent to a different email address');
    await tx.user.update({ where: { id: input.user.id }, data: { platformRole: invite.role } });
    await tx.platformAdminInvite.update({ where: { id: invite.id }, data: { acceptedAt: now } });
    await recordPlatformAudit(tx, {
      adminId: input.user.id,
      action: 'admin.accept',
      targetType: 'user',
      targetId: input.user.id,
      data: { role: invite.role },
    });
    return { role: invite.role };
  });
}

/** Changes a platform admin's role. The last owner cannot be demoted. */
export async function changePlatformAdminRole(
  actor: PlatformAdminActor,
  userId: string,
  role: PlatformRole,
): Promise<PlatformAdmin> {
  return withUser(actor.userId, async (tx) => {
    const owners = await lockOwners(tx);
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, platformRole: true },
    });
    if (!target?.platformRole) throw notFound('Platform administrator');
    if (target.platformRole === 'owner' && role !== 'owner' && owners <= 1) throw lastOwner();
    if (target.platformRole !== role) {
      await tx.user.update({ where: { id: userId }, data: { platformRole: role } });
      await recordPlatformAudit(tx, {
        adminId: actor.userId,
        action: 'admin.role_change',
        targetType: 'user',
        targetId: userId,
        data: { from: target.platformRole, to: role },
      });
    }
    return { userId, email: target.email, name: target.name, role };
  });
}

/** Removes platform access (the person's account stays). The last owner cannot be removed. */
export async function removePlatformAdmin(
  actor: PlatformAdminActor,
  userId: string,
): Promise<void> {
  await withUser(actor.userId, async (tx) => {
    const owners = await lockOwners(tx);
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { platformRole: true },
    });
    if (!target?.platformRole) throw notFound('Platform administrator');
    if (target.platformRole === 'owner' && owners <= 1) throw lastOwner();
    await tx.user.update({ where: { id: userId }, data: { platformRole: null } });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'admin.remove',
      targetType: 'user',
      targetId: userId,
      data: { was: target.platformRole },
    });
  });
}
