// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface AdminShellProps {
  userName: string;
  role: 'owner' | 'admin' | 'support';
  children: ReactNode;
}

/** Frame for /admin (platform administrators): header, navigation, main content. */
export function AdminShell({ userName, role, children }: AdminShellProps) {
  const common = useTranslations('common');
  const t = useTranslations('admin');
  const pathname = usePathname();
  const items = [
    { href: '/admin/agencies', label: t('nav.agencies') },
    { href: '/admin/usage', label: t('nav.usage') },
    { href: '/admin/audit', label: t('nav.audit') },
    ...(role === 'owner' ? [{ href: '/admin/admins', label: t('nav.admins') }] : []),
    { href: '/admin/settings', label: t('nav.settings') },
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2">
        <span className="font-semibold">{common('appName')}</span>
        <span className="rounded-sm bg-surface px-2 py-0.5 text-xs font-medium">{t('title')}</span>
        <div className="ml-auto text-sm text-muted">
          {t('signedInAs', { name: userName, role: t(`roles.${role}`) })}
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-border md:w-56 md:border-r md:border-b-0">
          <nav aria-label={t('nav.label')} className="flex flex-col gap-1 p-3">
            {items.map((item) => {
              const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm hover:bg-surface',
                    current ? 'bg-surface font-medium' : 'text-muted',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main id="main" className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
