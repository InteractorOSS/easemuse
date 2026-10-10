// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getTranslations } from 'next-intl/server';
import { TasksView } from '@/components/tasks/tasks-view';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function AgencyHomePage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  const t = await getTranslations('workbench');
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-lg font-medium">{t('welcome', { agency: access.agency.name })}</p>
        <p className="text-sm text-muted">{t('yourRole', { role: t(`roles.${access.role}`) })}</p>
      </header>
      {/* Today: the person's own due tasks, overdue first (US-006). */}
      <TasksView agencyId={access.agency.id} />
    </div>
  );
}
