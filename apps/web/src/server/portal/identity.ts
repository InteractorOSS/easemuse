// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { randomBytes } from 'node:crypto';
import {
  PORTAL_INVITE_TTL_DAYS,
  PORTAL_RELOGIN_TTL_MINUTES,
  type AgencyActor,
  type InvitePortalUserInput,
  type PortalAudienceValue,
} from '@easemuse/core';
import { getAgencyByRef, withAgency, type ScopedTx } from '@/lib/db';
import { ApiError, forbidden, notFound } from '@/lib/http/errors';
import { logActivity } from '@/server/activity/service';
import { createOutboxMessage } from '@/server/messaging/outbox';
import { assertFeature, isFeatureEnabled } from '@/server/platform/features';
import { hashToken } from '@/server/tenancy/invites';

const MINUTE = 60_000;
const DAY = 86_400_000;

export interface PortalLink {
  portalUserId: string;
  audience: PortalAudienceValue;
  email: string;
  /** The plaintext token, shown once: only its hash is stored. */
  token: string;
  expiresAt: Date;
}

async function issueLink(
  tx: ScopedTx,
  input: {
    agencyId: string;
    portalUserId: string;
    ttlMs: number;
    createdById: string | null;
    now: Date;
  },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(input.now.getTime() + input.ttlMs);
  await tx.magicLink.create({
    data: {
      agencyId: input.agencyId,
      portalUserId: input.portalUserId,
      tokenHash: hashToken(token),
      expiresAt,
      createdById: input.createdById,
    },
  });
  return { token, expiresAt };
}

/**
 * Invites a hiring manager (a client contact) or a candidate to the portal (FR-HMP-01, FR-CDP-01).
 * The email comes from the record on file. Inviting someone again issues a fresh link and revokes
 * none of the shares; the identity is one per agency, audience and email (Q-26). Leads and admins
 * invite hiring managers; whoever works with a candidate may invite that candidate.
 */
export async function invitePortalUser(
  tx: ScopedTx,
  actor: AgencyActor,
  input: InvitePortalUserInput,
  now: Date = new Date(),
): Promise<PortalLink> {
  await assertFeature(tx, actor.agencyId, 'portals');
  let email: string | null;
  let link: { clientContactId: string } | { candidateId: string };
  if (input.audience === 'hiring_manager') {
    if (actor.role === 'recruiter')
      throw forbidden('Only a lead or an admin can invite a hiring manager');
    const contact = await tx.clientContact.findUnique({
      where: { id: input.clientContactId },
      select: { email: true },
    });
    if (!contact) throw notFound('Contact');
    email = contact.email;
    link = { clientContactId: input.clientContactId };
  } else {
    const candidate = await tx.candidate.findUnique({
      where: { id: input.candidateId },
      select: { email: true, status: true, doNotContact: true, anonymizedAt: true },
    });
    if (!candidate || candidate.status === 'discarded' || candidate.anonymizedAt)
      throw notFound('Candidate');
    if (candidate.doNotContact) {
      throw new ApiError('do_not_contact', 'This candidate is marked do not contact', {
        status: 409,
      });
    }
    email = candidate.email;
    link = { candidateId: input.candidateId };
  }
  if (!email) {
    throw new ApiError('conflict', 'There is no email address on file for this person', {
      status: 409,
    });
  }
  const address = email.toLowerCase();
  const existing = await tx.portalUser.findFirst({ where: { ...link } });
  const portalUser = existing
    ? await tx.portalUser.update({
        where: { id: existing.id },
        data: { disabledAt: null, email: address },
      })
    : await tx.portalUser.create({
        data: { agencyId: actor.agencyId, audience: input.audience, email: address, ...link },
      });
  const issued = await issueLink(tx, {
    agencyId: actor.agencyId,
    portalUserId: portalUser.id,
    ttlMs: PORTAL_INVITE_TTL_DAYS * DAY,
    createdById: actor.userId,
    now,
  });
  await logActivity(tx, {
    agencyId: actor.agencyId,
    actor: { type: 'user', id: actor.userId },
    action: 'portal.invited',
    entityType: input.audience === 'candidate' ? 'candidate' : 'client',
    entityId:
      'candidateId' in link
        ? link.candidateId
        : (
            await tx.clientContact.findUniqueOrThrow({
              where: { id: link.clientContactId },
              select: { clientId: true },
            })
          ).clientId,
    data: { audience: input.audience },
  });
  return { portalUserId: portalUser.id, audience: input.audience, email: address, ...issued };
}

/** Disables a portal user: their sessions stop working at the next request and links stop redeeming. */
export async function disablePortalUser(
  tx: ScopedTx,
  actor: AgencyActor,
  portalUserId: string,
  now: Date = new Date(),
) {
  if (actor.role === 'recruiter') throw forbidden('Only a lead or an admin can do this');
  const user = await tx.portalUser.findUnique({
    where: { id: portalUserId },
    select: { id: true },
  });
  if (!user) throw notFound('Portal user');
  await tx.portalUser.update({ where: { id: portalUserId }, data: { disabledAt: now } });
  await tx.magicLink.updateMany({ where: { portalUserId, usedAt: null }, data: { usedAt: now } });
}

export interface Redeemed {
  portalUserId: string;
  agencyId: string;
  audience: PortalAudienceValue;
}

/**
 * Redeems a magic link (single use). The agency slug sets the agency context before the token is
 * looked up (ADR-001). Unknown and foreign tokens are 404, used 409, expired 410, a disabled
 * person 403. A suspended agency's portal is closed too.
 */
export async function redeemMagicLink(input: {
  agencySlug: string;
  token: string;
  now?: Date;
}): Promise<Redeemed> {
  const agency = await getAgencyByRef(input.agencySlug);
  if (!agency) throw notFound('Link');
  if (agency.status === 'suspended' || agency.status === 'closed') {
    throw new ApiError('agency_suspended', 'This agency is not active', { status: 403 });
  }
  if (!(await isFeatureEnabled(agency.id, 'portals'))) throw notFound('Link');
  const now = input.now ?? new Date();
  return withAgency(agency.id, async (tx) => {
    const link = await tx.magicLink.findUnique({
      where: { tokenHash: hashToken(input.token) },
      include: { portalUser: true },
    });
    if (!link || link.agencyId !== agency.id) throw notFound('Link');
    if (link.usedAt) throw new ApiError('link_used', 'This link was already used', { status: 409 });
    if (link.expiresAt <= now)
      throw new ApiError('link_expired', 'This link has expired', { status: 410 });
    if (link.portalUser.disabledAt) throw forbidden('This access has been turned off');
    // Single use: the update only succeeds for a link that is still unused (two clicks race).
    const claimed = await tx.magicLink.updateMany({
      where: { id: link.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count === 0)
      throw new ApiError('link_used', 'This link was already used', { status: 409 });
    await logActivity(tx, {
      agencyId: agency.id,
      actor: { type: 'portal_user', id: link.portalUser.id },
      action: 'portal.signed_in',
      entityType: 'portal_user',
      entityId: link.portalUser.id,
      data: { audience: link.portalUser.audience },
    });
    return {
      portalUserId: link.portalUser.id,
      agencyId: agency.id,
      audience: link.portalUser.audience,
    };
  });
}

/**
 * A fresh short-lived link for someone who is already invited (re-login, 15 minutes). The answer
 * never says whether the email was known; the caller sends the email only when a link is returned.
 */
export async function requestRelogin(input: {
  agencySlug: string;
  email: string;
  audience: PortalAudienceValue;
  now?: Date;
}): Promise<PortalLink | null> {
  const agency = await getAgencyByRef(input.agencySlug);
  if (!agency || agency.status === 'suspended' || agency.status === 'closed') return null;
  if (!(await isFeatureEnabled(agency.id, 'portals'))) return null;
  const now = input.now ?? new Date();
  return withAgency(agency.id, async (tx) => {
    const user = await tx.portalUser.findUnique({
      where: {
        agencyId_audience_email: {
          agencyId: agency.id,
          audience: input.audience,
          email: input.email.toLowerCase(),
        },
      },
    });
    if (!user || user.disabledAt) return null;
    const issued = await issueLink(tx, {
      agencyId: agency.id,
      portalUserId: user.id,
      ttlMs: PORTAL_RELOGIN_TTL_MINUTES * MINUTE,
      createdById: null,
      now,
    });
    return { portalUserId: user.id, audience: user.audience, email: user.email, ...issued };
  });
}

/** Queues the email that carries the link. Called inside the transaction that issued it. */
export async function queuePortalEmail(
  tx: ScopedTx,
  input: {
    agencyId: string;
    senderId: string | null;
    email: string;
    subject: string;
    text: string;
    html: string;
  },
): Promise<{ id: string }> {
  return createOutboxMessage(tx, {
    agencyId: input.agencyId,
    senderId: input.senderId,
    toAddress: input.email,
    subject: input.subject,
    bodyText: input.text,
    bodyHtml: input.html,
    kind: 'portal_invite',
  });
}
