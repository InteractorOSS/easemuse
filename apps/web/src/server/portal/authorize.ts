// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { cookies } from 'next/headers';
import type { PortalActor, PortalAudienceValue } from '@easemuse/core';
import { getAgencyByRef, withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { errorResponse } from '@/lib/http/responses';
import { ApiError } from '@/lib/http/errors';
import { PORTAL_COOKIE, verifyPortalSession } from './session';

export interface AuthedPortal {
  actor: PortalActor;
  agency: { id: string; slug: string; name: string };
  portalUser: {
    id: string;
    email: string;
    audience: PortalAudienceValue;
    candidateId: string | null;
    clientContactId: string | null;
  };
}

/**
 * The portal twin of `authorizeAgency` (ADR-002, ADR-003): reads the portal cookie, checks it is for
 * this agency and audience, and checks the person is still enabled and the agency active. Anything
 * short of that is a 401 (no session) or 404 (wrong agency or audience), never a hint about what
 * exists. Portal routes call this first:
 *
 *   const authed = await authorizePortal(slug, 'hiring_manager'); // or just (slug) for either audience
 *   if (authed instanceof Response) return authed;
 */
export async function authorizePortal(
  agencySlug: string,
  audience?: PortalAudienceValue,
): Promise<AuthedPortal | Response> {
  const secret = getEnv().AUTH_SECRET;
  const session = secret
    ? verifyPortalSession(secret, (await cookies()).get(PORTAL_COOKIE)?.value)
    : null;
  if (!session)
    return errorResponse(new ApiError('unauthorized', 'Sign in with your link', { status: 401 }));
  const agency = await getAgencyByRef(agencySlug);
  if (
    !agency ||
    agency.id !== session.agencyId ||
    (audience !== undefined && session.audience !== audience) ||
    agency.status === 'suspended' ||
    agency.status === 'closed'
  ) {
    return errorResponse(new ApiError('not_found', 'Not found', { status: 404 }));
  }
  const portalUser = await withAgency(agency.id, (tx) =>
    tx.portalUser.findUnique({
      where: { id: session.portalUserId },
      select: {
        id: true,
        email: true,
        audience: true,
        candidateId: true,
        clientContactId: true,
        disabledAt: true,
      },
    }),
  );
  if (!portalUser || portalUser.disabledAt || portalUser.audience !== session.audience) {
    return errorResponse(
      new ApiError('unauthorized', 'This access has been turned off', { status: 401 }),
    );
  }
  const { disabledAt: _off, ...user } = portalUser;
  void _off;
  return {
    actor: {
      kind: 'portal',
      portalUserId: user.id,
      agencyId: agency.id,
      audience: session.audience,
    } as PortalActor,
    agency: { id: agency.id, slug: agency.slug, name: agency.name },
    portalUser: user,
  };
}
