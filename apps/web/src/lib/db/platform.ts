// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
//
// Reads and writes on PLATFORM tables (User, Agency): tables outside RLS that hold no candidate
// data (ADR-001). Kept inside lib/db so the unscoped client never leaks into application code.
import { getDbHandle } from './client';

export type PlatformRoleName = 'owner' | 'admin' | 'support';

export interface PlatformUser {
  id: string;
  email: string;
  name: string | null;
  platformRole: PlatformRoleName | null;
  /** UI language; null means the agency default, then English (ADR-015). */
  locale: string | null;
}

export interface AgencyRef {
  id: string;
  slug: string;
  name: string;
  status: 'trial' | 'active' | 'suspended' | 'closed';
}

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  platformRole: true,
  locale: true,
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sign-in: find or create the local user by the Account Server `sub` (the durable identity; an
 * email address can be re-registered by someone else). The email follows the Account Server; the
 * name is set on first sign-in only.
 */
export async function upsertUserBySubject(input: {
  subject: string;
  email: string;
  name?: string | null | undefined;
}): Promise<PlatformUser> {
  const { prisma } = getDbHandle();
  return prisma.user.upsert({
    where: { interactorSubject: input.subject },
    create: { interactorSubject: input.subject, email: input.email, name: input.name ?? null },
    update: { email: input.email },
    select: USER_SELECT,
  });
}

export async function getPlatformUser(id: string): Promise<PlatformUser | null> {
  if (!UUID.test(id)) return null;
  const { prisma } = getDbHandle();
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
}

/** Resolves an agency from the UUID or the slug that API paths accept (api-contracts.md). */
export async function getAgencyByRef(ref: string): Promise<AgencyRef | null> {
  const { prisma } = getDbHandle();
  return prisma.agency.findUnique({
    where: UUID.test(ref) ? { id: ref } : { slug: ref },
    select: { id: true, slug: true, name: true, status: true },
  });
}

export async function getAgenciesByIds(ids: string[]): Promise<AgencyRef[]> {
  if (ids.length === 0) return [];
  const { prisma } = getDbHandle();
  return prisma.agency.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, name: true, status: true },
    orderBy: { name: 'asc' },
  });
}

/** The user's own UI language; pass null to fall back to the agency default. */
export async function setUserLocale(userId: string, locale: string | null): Promise<void> {
  const { prisma } = getDbHandle();
  await prisma.user.update({ where: { id: userId }, data: { locale } });
}

/** The agency's default UI language from `Agency.settings.locale` (ADR-015), or null if unset. */
export async function getAgencyDefaultLocale(agencyId: string): Promise<string | null> {
  const { prisma } = getDbHandle();
  const row = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { settings: true },
  });
  const settings = row?.settings;
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const locale = (settings as Record<string, unknown>).locale;
    return typeof locale === 'string' ? locale : null;
  }
  return null;
}

export interface AgencyListItem extends AgencyRef {
  region: string;
  plan: string | null;
  createdAt: Date;
}

/** One page of agencies for /admin, newest first. Agency is a platform table, so no agency scope is needed. */
export async function findAgenciesPage(input: {
  q?: string | undefined;
  status?: AgencyRef['status'] | undefined;
  limit: number;
  after?: { createdAt: Date; id: string } | undefined;
}): Promise<AgencyListItem[]> {
  const { prisma } = getDbHandle();
  const q = input.q?.trim();
  return prisma.agency.findMany({
    where: {
      AND: [
        ...(input.status ? [{ status: input.status }] : []),
        ...(q
          ? [
              {
                OR: [
                  { name: { contains: q, mode: 'insensitive' as const } },
                  { slug: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
        ...(input.after
          ? [
              {
                OR: [
                  { createdAt: { lt: input.after.createdAt } },
                  { createdAt: input.after.createdAt, id: { lt: input.after.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      region: true,
      plan: true,
      createdAt: true,
    },
  });
}

export async function findUserByEmail(email: string): Promise<PlatformUser | null> {
  const { prisma } = getDbHandle();
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: USER_SELECT,
  });
}

/** One agency with the fields /admin shows (region, plan, created). */
export async function getAgencyListItem(ref: string): Promise<AgencyListItem | null> {
  const { prisma } = getDbHandle();
  return prisma.agency.findUnique({
    where: UUID.test(ref) ? { id: ref } : { slug: ref },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      region: true,
      plan: true,
      createdAt: true,
    },
  });
}

/** Ids of agencies that still run jobs (everything but closed), for scheduled per-agency work. */
export async function listActiveAgencyIds(): Promise<string[]> {
  const { prisma } = getDbHandle();
  const rows = await prisma.agency.findMany({
    where: { status: { not: 'closed' } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => r.id);
}

export interface AuditEntry {
  id: string;
  adminId: string;
  adminEmail: string | null;
  action: string;
  agencyId: string | null;
  agencyName: string | null;
  targetType: string | null;
  targetId: string | null;
  data: unknown;
  createdAt: Date;
}

/** One page of the platform audit log, newest first (T-ADM-05). Entries never hold agency content. */
export async function findAuditPage(input: {
  adminId?: string | undefined;
  agencyId?: string | undefined;
  action?: string | undefined;
  limit: number;
  after?: { createdAt: Date; id: string } | undefined;
}): Promise<AuditEntry[]> {
  const { prisma } = getDbHandle();
  const rows = await prisma.platformAuditLog.findMany({
    where: {
      AND: [
        ...(input.adminId ? [{ adminId: input.adminId }] : []),
        ...(input.agencyId ? [{ agencyId: input.agencyId }] : []),
        ...(input.action ? [{ action: { startsWith: input.action } }] : []),
        ...(input.after
          ? [
              {
                OR: [
                  { createdAt: { lt: input.after.createdAt } },
                  { createdAt: input.after.createdAt, id: { lt: input.after.id } },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
  });
  const adminIds = [...new Set(rows.map((r) => r.adminId))];
  const agencyIds = [...new Set(rows.flatMap((r) => (r.agencyId ? [r.agencyId] : [])))];
  const [admins, agencies] = await Promise.all([
    adminIds.length
      ? prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
      : [],
    agencyIds.length
      ? prisma.agency.findMany({
          where: { id: { in: agencyIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const email = new Map(admins.map((a) => [a.id, a.email]));
  const name = new Map(agencies.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    adminId: r.adminId,
    adminEmail: email.get(r.adminId) ?? null,
    action: r.action,
    agencyId: r.agencyId,
    agencyName: r.agencyId ? (name.get(r.agencyId) ?? null) : null,
    targetType: r.targetType,
    targetId: r.targetId,
    data: r.data,
    createdAt: r.createdAt,
  }));
}

/** The stored (encrypted) value of a platform secret, read without a user context for the AI client. */
export async function getPlatformSecretRow(name: string): Promise<{ ciphertext: string } | null> {
  const { prisma } = getDbHandle();
  return prisma.platformSecret.findUnique({ where: { name }, select: { ciphertext: true } });
}

/** What a portal page needs to know about the agency: name, state and branding (no tenant data). */
export async function getAgencyPortalInfo(slug: string) {
  const { prisma } = getDbHandle();
  return prisma.agency.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true, branding: true },
  });
}
