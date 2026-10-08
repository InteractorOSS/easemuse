// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { DetailsView } from '@/components/portal/details-view';

export default async function DetailsPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  return <DetailsView slug={agencySlug} />;
}
