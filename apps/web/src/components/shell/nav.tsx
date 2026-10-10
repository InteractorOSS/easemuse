// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const ITEMS = [
  'home',
  'tasks',
  'positions',
  'candidates',
  'clients',
  'analytics',
  'settings',
] as const;

/** Main navigation for one agency's workbench. The current page is marked with aria-current. */
export function Nav({ agencySlug }: { agencySlug: string }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('label')} className="flex flex-col gap-1 p-3">
      {ITEMS.map((item) => {
        const href = item === 'home' ? `/a/${agencySlug}` : `/a/${agencySlug}/${item}`;
        // Home is the agency root, so it is current only on that exact page.
        const current = pathname === href || (item !== 'home' && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={item}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-2 text-sm hover:bg-surface',
              current ? 'bg-surface font-medium text-foreground' : 'text-muted',
            )}
          >
            {t(item)}
          </Link>
        );
      })}
    </nav>
  );
}
