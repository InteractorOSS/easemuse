// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { SettingsView } from '@/components/admin/settings-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function AdminSettingsPage() {
  const access = await platformAdminAccess();
  return <SettingsView canWrite={access.actor.role === 'owner'} />;
}
