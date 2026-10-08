// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ConsentView } from '@/components/portal/consent-view';

export default async function ConsentPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  return <ConsentView slug={agencySlug} />;
}
