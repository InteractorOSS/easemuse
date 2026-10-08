// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { DeletionsView } from '@/components/admin/deletions-view';
import { platformAdminAccess } from '@/lib/auth/page-access';

export default async function DeletionsPage() {
  await platformAdminAccess();
  return <DeletionsView />;
}
