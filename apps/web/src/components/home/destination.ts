// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { Me } from '@/server/tenancy/me';

/**
 * Where a signed-in user goes from the home page when there is exactly one place for them:
 * a platform admin with no agency to the admin console, a member of one agency to its workbench.
 * Null means they choose (or have nowhere to go yet).
 */
export function soleDestination(me: Pick<Me, 'user' | 'memberships'>): string | null {
  const admin = me.user.platformRole !== null;
  const [first, ...rest] = me.memberships;
  if (!first) return admin ? '/admin' : null;
  if (rest.length === 0 && !admin) return `/a/${first.slug}`;
  return null;
}
