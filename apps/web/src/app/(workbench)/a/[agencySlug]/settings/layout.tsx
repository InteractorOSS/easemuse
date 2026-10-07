// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/query-provider';
import { SettingsNav } from '@/components/settings/settings-nav';
import { agencyAccess } from '@/lib/auth/page-access';

export default async function SettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  return (
    <QueryProvider>
      <div className="flex flex-col gap-6">
        <SettingsNav agencySlug={access.agency.slug} role={access.role} />
        {children}
      </div>
    </QueryProvider>
  );
}
