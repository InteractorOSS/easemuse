// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import type { AgencyRole } from '@easemuse/core';
import { getAgencyByRef, withAgency } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';

/** Invite tokens are stored only as a hash (ADR-002); the plaintext goes in the email link. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface AcceptInviteInput {
  /** From the route: the slug sets the agency context BEFORE the token is looked up (ADR-001). */
  agencySlug: string;
  token: string;
  user: { id: string; email: string };
  now?: Date;
}

/**
 * Accepts a member invite for the signed-in user (api-contracts §1). Unknown, revoked or
 * foreign-agency tokens are all 404; expired is 410; used is 409; another person's email is 403.
 */
export async function acceptInvite(
  input: AcceptInviteInput,
): Promise<{ membershipId: string; agencyId: string; role: AgencyRole }> {
  const agency = await getAgencyByRef(input.agencySlug);
  if (!agency) throw notFound('Invite');
  if (agency.status === 'suspended' || agency.status === 'closed') {
    throw new ApiError('agency_suspended', 'This agency is not active', { status: 403 });
  }
  const now = input.now ?? new Date();

  return withAgency(
    agency.id,
    async (tx) => {
      const invite = await tx.memberInvite.findUnique({
        where: { tokenHash: hashToken(input.token) },
      });
      if (!invite || invite.agencyId !== agency.id || invite.revokedAt) throw notFound('Invite');
      if (invite.acceptedAt) {
        throw new ApiError('invite_already_accepted', 'This invite was already used', {
          status: 409,
        });
      }
      if (invite.expiresAt <= now) {
        throw new ApiError('invite_expired', 'This invite has expired', { status: 410 });
      }
      if (invite.email.toLowerCase() !== input.user.email.toLowerCase()) {
        throw forbidden('This invite was sent to a different email address');
      }

      const membership = await tx.membership.upsert({
        where: { agencyId_userId: { agencyId: agency.id, userId: input.user.id } },
        create: { agencyId: agency.id, userId: input.user.id, role: invite.role },
        update: { role: invite.role, active: true },
      });
      await tx.memberInvite.update({ where: { id: invite.id }, data: { acceptedAt: now } });
      await tx.activityLog.create({
        data: {
          agencyId: agency.id,
          actorType: 'user',
          actorId: input.user.id,
          action: 'member.invite_accepted',
          entityType: 'membership',
          entityId: membership.id,
          data: { role: invite.role, inviteId: invite.id },
        },
      });
      return { membershipId: membership.id, agencyId: agency.id, role: membership.role };
    },
    { userId: input.user.id },
  );
}
