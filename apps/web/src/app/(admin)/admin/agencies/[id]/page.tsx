// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { AgencyDetailView } from '@/components/admin/agency-detail-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function AgencyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await platformAdminAccess();
  return (
    <AgencyDetailView agencyId={id} canWrite={actor.role === 'owner' || actor.role === 'admin'} />
  );
}
