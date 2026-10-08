// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { parseBranding, type AgencyBranding, type PortalAudienceValue } from '@easemuse/core';
import { getAgencyPortalInfo, withAgency } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logoPath } from '@/server/branding/brand';
import { isFeatureEnabled } from '@/server/platform/features';
import { PORTAL_PREFIX } from './links';
import { PORTAL_COOKIE, verifyPortalSession } from './session';

export interface PortalPageAccess {
  agency: {
    id: string;
    slug: string;
    name: string;
    branding: AgencyBranding;
    /** Root-relative address of the public logo route, or null (FR-TEN-04). */
    logoUrl: string | null;
  };
  portalUserId: string;
  audience: PortalAudienceValue;
}

/** The agency behind a portal address, with its branding; unknown or closed agencies are a 404. */
export const portalAgency = cache(async (slug: string) => {
  const agency = await getAgencyPortalInfo(slug);
  if (!agency || agency.status === 'suspended' || agency.status === 'closed') notFound();
  if (!(await isFeatureEnabled(agency.id, 'portals'))) notFound();
  const branding = parseBranding(agency.branding);
  return {
    id: agency.id,
    slug: agency.slug,
    name: agency.name,
    branding,
    logoUrl: branding.logoFileId ? logoPath(agency.slug, branding.logoFileId) : null,
  };
});

/**
 * Access check for portal PAGES, like `agencyAccess` for the workbench: no valid session for this
 * agency and audience sends the person to the "enter" page; everything else looks like a missing page.
 */
export const portalPageAccess = cache(
  async (slug: string, audience: PortalAudienceValue): Promise<PortalPageAccess> => {
    const agency = await portalAgency(slug);
    const enter = `/${PORTAL_PREFIX[audience]}/${slug}/enter`;
    const secret = getEnv().AUTH_SECRET;
    const session = secret
      ? verifyPortalSession(secret, (await cookies()).get(PORTAL_COOKIE)?.value)
      : null;
    if (!session || session.agencyId !== agency.id || session.audience !== audience)
      redirect(enter);
    const user = await withAgency(agency.id, (tx) =>
      tx.portalUser.findUnique({
        where: { id: session.portalUserId },
        select: { audience: true, disabledAt: true },
      }),
    );
    if (!user || user.disabledAt || user.audience !== audience) redirect(enter);
    return { agency, portalUserId: session.portalUserId, audience };
  },
);
