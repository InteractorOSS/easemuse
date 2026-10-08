// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { AnalyticsView } from '@/components/analytics/analytics-view';
import { agencyAccess } from '@/lib/auth/page-access';

/** Recruiting analytics (US-1101); any member, counting only the positions they may see. */
export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return (
    <AnalyticsView
      agencyId={access.agency.id}
      canFilterByRecruiter={access.role === 'admin' || access.role === 'lead'}
    />
  );
}
