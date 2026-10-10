// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { PortalHelp } from '@/components/help/portal-help';

export default async function HelpPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  return <PortalHelp prefix="h" slug={agencySlug} />;
}
