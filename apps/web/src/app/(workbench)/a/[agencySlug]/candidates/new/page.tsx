// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { NewCandidate } from '@/components/candidates/new-candidate';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function NewCandidatePage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <NewCandidate agencyId={access.agency.id} agencySlug={access.agency.slug} />;
}
