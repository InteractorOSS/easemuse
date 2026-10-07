// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ReviewBoard } from '@/components/pipeline/review-board';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function PositionCandidatesPage({
  params,
}: {
  params: Promise<{ agencySlug: string; positionId: string }>;
}) {
  const { agencySlug, positionId } = await params;
  const access = await agencyAccess(agencySlug);
  if (!z.guid().safeParse(positionId).success) notFound();
  // The position's own permission (owner, lead, admin) is checked by the API; the page only decides which controls to show.
  return (
    <ReviewBoard
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      positionId={positionId}
      viewer={{ userId: access.userId, role: access.role }}
    />
  );
}
