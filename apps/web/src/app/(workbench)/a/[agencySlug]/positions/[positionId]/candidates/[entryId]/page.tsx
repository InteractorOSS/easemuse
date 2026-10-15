// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AnalysisView } from '@/components/pipeline/analysis-view';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string; positionId: string; entryId: string }>;
  searchParams: Promise<{ analyze?: string }>;
}) {
  const { agencySlug, positionId, entryId } = await params;
  const { analyze } = await searchParams;
  const access = await agencyAccess(agencySlug);
  if (!z.guid().safeParse(positionId).success || !z.guid().safeParse(entryId).success) notFound();
  return (
    <AnalysisView
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      positionId={positionId}
      entryId={entryId}
      autoStart={analyze === '1'}
    />
  );
}
