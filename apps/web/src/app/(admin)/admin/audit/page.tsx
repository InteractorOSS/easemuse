// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { AuditView } from '@/components/admin/audit-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function AuditPage() {
  await platformAdminAccess();
  return <AuditView />;
}
