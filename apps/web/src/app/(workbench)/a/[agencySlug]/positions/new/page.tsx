// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { NewPosition } from '@/components/positions/new-position';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function NewPositionPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <NewPosition agencyId={access.agency.id} agencySlug={access.agency.slug} />;
}
