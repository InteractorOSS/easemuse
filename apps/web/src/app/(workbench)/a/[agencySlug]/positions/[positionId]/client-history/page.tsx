// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ClientHistoryView } from '@/components/knowledge/client-history-view';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function ClientHistoryPage({
  params,
}: {
  params: Promise<{ agencySlug: string; positionId: string }>;
}) {
  const { agencySlug, positionId } = await params;
  const access = await agencyAccess(agencySlug);
  if (!z.guid().safeParse(positionId).success) notFound();
  return (
    <ClientHistoryView
      agencyId={access.agency.id}
      agencySlug={access.agency.slug}
      positionId={positionId}
    />
  );
}
