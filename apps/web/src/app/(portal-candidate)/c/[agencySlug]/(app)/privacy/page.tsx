// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { PrivacyView } from '@/components/portal/privacy-view';

export default async function PrivacyPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  return <PrivacyView slug={agencySlug} />;
}
