// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { AgencyRole } from '@easemuse/core';
import { getAgenciesByIds, getPlatformUser, withUser, type PlatformUser } from '@/lib/db';
import { notFound } from '@/lib/http/errors';

export interface Me {
  user: PlatformUser;
  memberships: { agencyId: string; slug: string; name: string; role: AgencyRole }[];
}

/**
 * The signed-in user and every agency they belong to. Memberships are read through the user-scoped
 * RLS policy (`app.user_id`), which is why this works before any agency is chosen (ADR-001).
 */
export async function getMe(userId: string): Promise<Me> {
  const user = await getPlatformUser(userId);
  if (!user) throw notFound('User');

  const rows = await withUser(userId, (tx) =>
    tx.membership.findMany({
      where: { userId, active: true },
      select: { agencyId: true, role: true },
    }),
  );
  const agencies = await getAgenciesByIds(rows.map((r) => r.agencyId));
  const roleByAgency = new Map(rows.map((r) => [r.agencyId, r.role]));
  return {
    user,
    memberships: agencies
      .filter((a) => a.status !== 'closed')
      .map((a) => ({ agencyId: a.id, slug: a.slug, name: a.name, role: roleByAgency.get(a.id)! })),
  };
}
