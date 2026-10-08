// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { ConfigView } from '@/components/admin/config-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function ConfigPage() {
  const access = await platformAdminAccess();
  return <ConfigView canWrite={access.actor.role === 'owner' || access.actor.role === 'admin'} />;
}
