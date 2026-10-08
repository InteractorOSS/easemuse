// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { HealthView } from '@/components/admin/health-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function HealthPage() {
  await platformAdminAccess();
  return <HealthView />;
}
