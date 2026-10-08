// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getAgencyByRef, getPlatformUser, withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { createAuthorizers } from './authorizers';
import { findActiveGrant, recordSupportView } from '@/server/support/access';
import { membershipLoader } from './membership';

/**
 * The process-wide authorizers (ADR-012). Route handlers call these first:
 *
 *   const authed = await authorizeAgency(params.agencyId, { roles: ['admin'] });
 *   if (authed instanceof Response) return authed;
 */
export const {
  authorizeAgency,
  authorizePlatformAdmin,
  authorizeUser,
  requireAgency,
  requirePlatformAdmin,
  requireUser,
  resolveActor,
} = createAuthorizers({
  async getSession() {
    const session = await auth();
    return session?.user?.id ? { userId: session.user.id, mfa: session.mfa === true } : null;
  },
  getUser: getPlatformUser,
  getAgency: getAgencyByRef,
  loadMembership: membershipLoader({ withAgency }),
  mfaEnforcement: () => getEnv().MFA_ENFORCEMENT,
  log: (message, data) => console.warn(`[auth] ${message}`, data),
  loadSupportGrant: (agencyId, userId) => findActiveGrant(agencyId, userId),
  /** Set by `src/proxy.ts` on every request; without it support access is refused. */
  async requestInfo() {
    try {
      const h = await headers();
      const method = h.get('x-easemuse-method');
      const path = h.get('x-easemuse-path');
      return method && path ? { method, path } : null;
    } catch {
      return null; // outside a request
    }
  },
  recordSupportView,
});
