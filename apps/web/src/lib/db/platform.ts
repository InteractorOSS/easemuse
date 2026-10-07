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
