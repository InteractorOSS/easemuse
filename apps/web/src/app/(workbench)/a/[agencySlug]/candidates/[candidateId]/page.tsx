// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CandidateDetail } from '@/components/candidates/candidate-detail';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function CandidatePage({
  params,
}: {
  params: Promise<{ agencySlug: string; candidateId: string }>;
}) {
  const { agencySlug, candidateId } = await params;
  const access = await agencyAccess(agencySlug);
  if (!z.guid().safeParse(candidateId).success) notFound();
  return (
    <CandidateDetail
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      candidateId={candidateId}
      viewerRole={access.role}
    />
  );
}
