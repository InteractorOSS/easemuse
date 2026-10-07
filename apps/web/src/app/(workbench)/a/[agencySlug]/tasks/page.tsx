// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { TasksView } from '@/components/tasks/tasks-view';
import { agencyAccess } from '@/lib/auth/page-access';

/** The signed-in person's own tasks; any member may open it. */
export default async function TasksPage({ params }: { params: Promise<{ agencySlug: string }> }) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return <TasksView agencyId={access.agency.id} />;
}
