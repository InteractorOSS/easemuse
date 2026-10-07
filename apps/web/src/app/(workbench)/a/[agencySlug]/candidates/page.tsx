// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { CandidatesPool, EMPTY_FILTERS } from '@/components/candidates/candidates-pool';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function CandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { agencySlug } = await params;
  const { q } = await searchParams;
  const access = await agencyAccess(agencySlug);
  return (
    <CandidatesPool
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      initial={{ ...EMPTY_FILTERS, q: typeof q === 'string' ? q.slice(0, 200) : '' }}
    />
  );
}
