// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { AgenciesView } from '@/components/admin/agencies-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function AgenciesPage() {
  const { actor } = await platformAdminAccess();
  return <AgenciesView canWrite={actor.role === 'owner' || actor.role === 'admin'} />;
}
