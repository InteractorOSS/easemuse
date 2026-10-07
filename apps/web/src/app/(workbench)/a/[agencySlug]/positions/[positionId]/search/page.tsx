// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { SearchCriteriaView } from '@/components/positions/search-criteria-view';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function SearchCriteriaPage({
  params,
}: {
  params: Promise<{ agencySlug: string; positionId: string }>;
}) {
  const { agencySlug, positionId } = await params;
  const access = await agencyAccess(agencySlug);
  if (!z.guid().safeParse(positionId).success) notFound();
  return (
    <SearchCriteriaView
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      positionId={positionId}
    />
  );
}
