// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { UsageView } from '@/components/admin/usage-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function UsagePage() {
  await platformAdminAccess();
  return <UsageView />;
}
