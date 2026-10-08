// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PortalShell } from '@/components/portal/portal-shell';
import { portalPageAccess } from '@/server/portal/page-access';

/** Signed-in frame: no valid session for this agency and audience goes to the enter page. */
export default async function SignedInLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await portalPageAccess(agencySlug, 'candidate');
  const t = await getTranslations('portal');
  return (
    <PortalShell
      agencyName={access.agency.branding.displayName ?? access.agency.name}
      color={access.agency.branding.primaryColor}
      slug={agencySlug}
      prefix="c"
      signedIn
      links={[
        { href: `/c/${agencySlug}/details`, label: t('details.link') },
        { href: `/c/${agencySlug}/consent`, label: t('consent.link') },
        { href: `/c/${agencySlug}/privacy`, label: t('privacy.link') },
      ]}
    >
      {children}
    </PortalShell>
  );
}
