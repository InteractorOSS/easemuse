// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { AnalyticsView } from '@/components/analytics/analytics-view';
import { agencyAccess } from '@/lib/auth/page-access';

/** KPIs, source results and capacity (brief §13). Every member may open it; a recruiter sees their own figures. */
export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return (
    <AnalyticsView agencyId={access.agency.id} canPickRecruiter={access.role !== 'recruiter'} />
  );
}
