// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { PositionsList } from '@/components/positions/positions-list';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function PositionsPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <PositionsList agencyId={access.agency.id} agencySlug={access.agency.slug} />;
}
