// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
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
  const access = await portalPageAccess(agencySlug, 'hiring_manager');
  return (
    <PortalShell
      agencyName={access.agency.branding.displayName ?? access.agency.name}
      color={access.agency.branding.primaryColor}
      logoUrl={access.agency.logoUrl}
      slug={agencySlug}
      prefix="h"
      signedIn
      links={[]}
    >
      {children}
    </PortalShell>
  );
}
