// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ShareList } from '@/components/portal/share-list';

export default async function PortalHome({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  return <ShareList slug={agencySlug} prefix="h" audience="hiring_manager" />;
}
