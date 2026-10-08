// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** Sections of Settings the person may open: members for admins and leads, branding and usage for admins only. */
export function SettingsNav({
  agencySlug,
  role,
}: {
  agencySlug: string;
  role: 'admin' | 'lead' | 'recruiter';
}) {
  const t = useTranslations('settings.nav');
  const pathname = usePathname();
  const items = [
    ...(role !== 'recruiter' ? [{ key: 'members' as const }] : []),
    { key: 'defaults' as const },
    ...(role === 'admin' ? [{ key: 'branding' as const }] : []),
    ...(role !== 'recruiter' ? [{ key: 'privacy' as const }] : []),
    ...(role === 'admin'
      ? [
          { key: 'plan' as const },
          { key: 'usage' as const },
          { key: 'outbox' as const },
          { key: 'support' as const },
          { key: 'export' as const },
        ]
      : []),
  ];
  return (
    <nav aria-label={t('label')} className="flex flex-wrap gap-1 border-b border-border">
      {items.map(({ key }) => {
        const href = `/a/${agencySlug}/settings/${key}`;
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              current
                ? 'border-primary font-medium'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
