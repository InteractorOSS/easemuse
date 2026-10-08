// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { EnterView } from '@/components/portal/enter-view';
import { PortalShell } from '@/components/portal/portal-shell';
import { portalAgency } from '@/server/portal/page-access';

export default async function EnterPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const agency = await portalAgency(agencySlug);
  return (
    <PortalShell
      agencyName={agency.branding.displayName ?? agency.name}
      color={agency.branding.primaryColor}
      slug={agencySlug}
      prefix="h"
      signedIn={false}
    >
      <EnterView slug={agencySlug} prefix="h" audience="hiring_manager" />
    </PortalShell>
  );
}
