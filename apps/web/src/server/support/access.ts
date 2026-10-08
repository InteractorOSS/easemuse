// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import {
  supportGrantStatus,
  type AgencyActor,
  type PlatformAdminActor,
  type SupportAccessRequestInput,
  type SupportDecisionInput,
  type SupportGrantStatus,
} from '@easemuse/core';
import { getAgencyByRef, getPlatformUser, withAgency, type ScopedTx } from '@/lib/db';
import { ApiError, notFound } from '@/lib/http/errors';
import { recordPlatformAudit } from '@/server/platform/audit';

/**
 * Support access (T-13-07, FR-TEN-07, FR-ADM-07, ADR-012). A platform administrator asks for a
 * time-limited, read-only look at one agency's workspace; an agency admin approves, denies or later
 * revokes it. Without an active grant a platform administrator sees nothing of the agency. Every
 * step, and every page or API read made under a grant, goes into both the platform audit log and the
 * agency's activity log (never any candidate or client content, only ids and paths).
 */

export interface SupportGrantView {
  id: string;
  adminId: string;
  adminEmail: string | null;
  reason: string;
  requestedHours: number;
  status: SupportGrantStatus;
  createdAt: Date;
  expiresAt: Date | null;
  decidedAt: Date | null;
}

export interface SupportViewEntry {
  id: string;
  at: Date;
  adminId: string | null;
  adminEmail: string | null;
  method: string | null;
  path: string | null;
}

export interface SupportOverview {
  grants: SupportGrantView[];
  /** The latest reads made under a grant, newest first. */
  views: SupportViewEntry[];
}

const LIST_LIMIT = 50;

type GrantRow = Awaited<ReturnType<ScopedTx['supportAccessGrant']['findFirstOrThrow']>>;

async function emailsOf(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const users = await Promise.all(unique.map((id) => getPlatformUser(id)));
  return new Map(users.flatMap((u) => (u ? [[u.id, u.email] as const] : [])));
}

function view(row: GrantRow, emails: Map<string, string>, now: Date): SupportGrantView {
  return {
    id: row.id,
    adminId: row.adminId,
    adminEmail: emails.get(row.adminId) ?? null,
    reason: row.reason,
    requestedHours: row.requestedHours,
    status: supportGrantStatus(row, now),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    decidedAt: row.decidedAt,
  };
}

async function grantsOf(tx: ScopedTx, agencyId: string, now: Date): Promise<SupportGrantView[]> {
  const rows = await tx.supportAccessGrant.findMany({
    where: { agencyId },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
  });
  const emails = await emailsOf(rows.map((r) => r.adminId));
  return rows.map((r) => view(r, emails, now));
}

const isOpen = (status: SupportGrantStatus) => status === 'pending' || status === 'active';

async function requireAgency(ref: string) {
  const agency = await getAgencyByRef(ref);
  if (!agency || agency.status === 'closed') throw notFound('Agency');
  return agency;
}

/** A platform administrator asks an agency's admins for access. One open request or grant per person and agency. */
export async function requestSupportAccess(
  actor: PlatformAdminActor,
  agencyRef: string,
  input: SupportAccessRequestInput,
  now: Date = new Date(),
): Promise<SupportGrantView> {
  const agency = await requireAgency(agencyRef);
  return withAgency(agency.id, async (tx) => {
    const mine = await tx.supportAccessGrant.findMany({
      where: { agencyId: agency.id, adminId: actor.userId },
    });
    if (mine.some((g) => isOpen(supportGrantStatus(g, now)))) {
      throw new ApiError('conflict', 'You already have an open request or grant for this agency', {
        status: 409,
      });
    }
    const grant = await tx.supportAccessGrant.create({
      data: {
        agencyId: agency.id,
        adminId: actor.userId,
        reason: input.reason,
        requestedHours: input.hours,
      },
    });
    await tx.activityLog.create({
      data: {
        agencyId: agency.id,
        actorType: 'platform_admin',
        actorId: actor.userId,
        action: 'support.requested',
        entityType: 'support_grant',
        entityId: grant.id,
        data: { hours: input.hours },
      },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'support.request',
      agencyId: agency.id,
      targetType: 'support_grant',
      targetId: grant.id,
      data: { hours: input.hours },
    });
    return view(grant, await emailsOf([actor.userId]), now);
  });
}

/** What /admin shows for one agency: every grant and request (metadata only, no agency content). */
export async function listSupportGrantsForPlatform(
  agencyRef: string,
  now: Date = new Date(),
): Promise<SupportGrantView[]> {
  const agency = await requireAgency(agencyRef);
  return withAgency(agency.id, (tx) => grantsOf(tx, agency.id, now));
}

/** The administrator ends their own request or access early. */
export async function endSupportAccess(
  actor: PlatformAdminActor,
  agencyRef: string,
  grantId: string,
  now: Date = new Date(),
): Promise<SupportGrantView> {
  const agency = await requireAgency(agencyRef);
  return withAgency(agency.id, async (tx) => {
    const grant = await tx.supportAccessGrant.findFirst({
      where: { id: grantId, agencyId: agency.id, adminId: actor.userId },
    });
    if (!grant) throw notFound('Grant');
    if (!isOpen(supportGrantStatus(grant, now))) {
      throw new ApiError('conflict', 'This request or grant is already over', { status: 409 });
    }
    const updated = await tx.supportAccessGrant.update({
      where: { id: grant.id },
      data: { revokedAt: now },
    });
    await tx.activityLog.create({
      data: {
        agencyId: agency.id,
        actorType: 'platform_admin',
        actorId: actor.userId,
        action: 'support.ended',
        entityType: 'support_grant',
        entityId: grant.id,
        data: {},
      },
    });
    await recordPlatformAudit(tx, {
      adminId: actor.userId,
      action: 'support.end',
      agencyId: agency.id,
      targetType: 'support_grant',
      targetId: grant.id,
    });
    return view(updated, await emailsOf([actor.userId]), now);
  });
}

/** For the agency admin: the requests and grants, and who looked at what and when. */
export async function getSupportOverview(
  actor: AgencyActor,
  now: Date = new Date(),
): Promise<SupportOverview> {
  const { grants, logs } = await withAgency(
    actor.agencyId,
    async (tx) => ({
      grants: await grantsOf(tx, actor.agencyId, now),
      logs: await tx.activityLog.findMany({
        where: { agencyId: actor.agencyId, action: 'support.view' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: LIST_LIMIT,
      }),
    }),
    { userId: actor.userId },
  );
  const emails = await emailsOf(logs.map((l) => l.actorId));
  return {
    grants,
    views: logs.map((l) => {
      const data = (l.data ?? {}) as { method?: string; path?: string };
      return {
        id: l.id,
        at: l.createdAt,
        adminId: l.actorId,
        adminEmail: l.actorId ? (emails.get(l.actorId) ?? null) : null,
        method: data.method ?? null,
        path: data.path ?? null,
      };
    }),
  };
}

/** An agency admin approves or denies a pending request, or revokes an active grant. */
export async function decideSupportGrant(
  actor: AgencyActor,
  grantId: string,
  input: SupportDecisionInput,
  now: Date = new Date(),
): Promise<SupportGrantView> {
  return withAgency(
    actor.agencyId,
    async (tx) => {
      const grant = await tx.supportAccessGrant.findFirst({
        where: { id: grantId, agencyId: actor.agencyId },
      });
      if (!grant) throw notFound('Grant');
      const status = supportGrantStatus(grant, now);
      const wanted = input.decision === 'revoke' ? 'active' : 'pending';
      if (status !== wanted) {
        throw new ApiError(
          'conflict',
          `This request is ${status}, so it cannot be ${input.decision}d`,
          {
            status: 409,
          },
        );
      }
      const data =
        input.decision === 'approve'
          ? {
              grantedById: actor.userId,
              decidedAt: now,
              expiresAt: new Date(now.getTime() + grant.requestedHours * 3_600_000),
            }
          : input.decision === 'deny'
            ? { deniedAt: now, decidedAt: now }
            : { revokedAt: now };
      const updated = await tx.supportAccessGrant.update({ where: { id: grant.id }, data });
      await tx.activityLog.create({
        data: {
          agencyId: actor.agencyId,
          actorType: 'user',
          actorId: actor.userId,
          action: `support.${input.decision === 'approve' ? 'approved' : input.decision === 'deny' ? 'denied' : 'revoked'}`,
          entityType: 'support_grant',
          entityId: grant.id,
          data: { adminId: grant.adminId },
        },
      });
      return view(updated, await emailsOf([grant.adminId]), now);
    },
    { userId: actor.userId },
  );
}

/** The grant that lets this platform administrator in right now, if any (used on every request). */
export async function findActiveGrant(
  agencyId: string,
  adminId: string,
  now: Date = new Date(),
): Promise<{ id: string; expiresAt: Date } | null> {
  return withAgency(agencyId, async (tx) => {
    const grant = await tx.supportAccessGrant.findFirst({
      where: {
        agencyId,
        adminId,
        revokedAt: null,
        deniedAt: null,
        grantedById: { not: null },
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'desc' },
    });
    return grant?.expiresAt ? { id: grant.id, expiresAt: grant.expiresAt } : null;
  });
}

/**
 * Writes the two log entries for one read under a grant, in ONE transaction: the platform audit log
 * and the agency's activity log. The caller refuses the request when this throws (fail closed).
 */
export async function recordSupportView(input: {
  agencyId: string;
  adminId: string;
  grantId: string;
  method: string;
  path: string;
}): Promise<void> {
  const path = input.path.slice(0, 300);
  await withAgency(input.agencyId, async (tx) => {
    await tx.activityLog.create({
      data: {
        agencyId: input.agencyId,
        actorType: 'platform_admin',
        actorId: input.adminId,
        action: 'support.view',
        entityType: 'support_grant',
        entityId: input.grantId,
        data: { method: input.method, path },
      },
    });
    await recordPlatformAudit(tx, {
      adminId: input.adminId,
      action: 'support.view',
      agencyId: input.agencyId,
      targetType: 'support_grant',
      targetId: input.grantId,
      data: { method: input.method, path },
    });
  });
}
