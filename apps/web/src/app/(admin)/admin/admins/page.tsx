// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound } from 'next/navigation';
import { AdminsView } from '@/components/admin/admins-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

/** Owners manage platform administrators; every other role gets a 404. */
export default async function AdminsPage() {
  const access = await platformAdminAccess();
  if (access.actor.role !== 'owner') notFound();
  return <AdminsView currentUserId={access.actor.userId} />;
}
