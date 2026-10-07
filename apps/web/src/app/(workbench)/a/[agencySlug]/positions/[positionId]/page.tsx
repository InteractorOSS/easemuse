// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PositionDetail } from '@/components/positions/position-detail';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function PositionPage({
  params,
}: {
  params: Promise<{ agencySlug: string; positionId: string }>;
}) {
  const { agencySlug, positionId } = await params;
  const access = await agencyAccess(agencySlug);
  if (!z.guid().safeParse(positionId).success) notFound();
  return (
    <PositionDetail
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      positionId={positionId}
      viewer={{ userId: access.userId, role: access.role }}
    />
  );
}
