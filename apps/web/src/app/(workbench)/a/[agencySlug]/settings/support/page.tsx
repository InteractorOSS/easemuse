// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { SupportAccess } from '@/components/settings/support-access';
import { agencyAccess } from '@/lib/auth/page-access';

/** Support access is decided by agency admins (FR-TEN-07); everyone else gets a 404. */
export default async function SupportAccessPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role !== 'admin') notFound();
  return <SupportAccess agencyId={access.agency.id} />;
}
