// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { UsageSummary } from '@/components/settings/usage-summary';
import { agencyAccess } from '@/lib/auth/page-access';

/** AI usage against the budget is for admins (api-contracts §1); everyone else gets a 404. */
export default async function UsagePage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  if (access.role !== 'admin') notFound();
  return <UsageSummary agencyId={access.agency.id} />;
}
