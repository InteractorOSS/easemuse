// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Scope } from '@/lib/db';
import type { AuthDeps } from './authorizers';

/**
 * Reads the caller's membership through RLS (agency context plus `app.user_id`), so a member only
 * ever sees their own row and a non-member sees nothing. Checked on every request, never cached
 * in the session, so deactivating a member takes effect immediately.
 */
export function membershipLoader(scope: Pick<Scope, 'withAgency'>): AuthDeps['loadMembership'] {
  return (agencyId, userId) =>
    scope.withAgency(
      agencyId,
      (tx) =>
        tx.membership.findUnique({
          where: { agencyId_userId: { agencyId, userId } },
          select: { role: true, active: true },
        }),
      { userId },
    );
}
