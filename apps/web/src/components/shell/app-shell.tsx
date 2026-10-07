// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AgencySwitcher, type AgencyOption } from './agency-switcher';
import { Nav } from './nav';

export interface AppShellProps {
  agencySlug: string;
  agencies: AgencyOption[];
  userName: string;
  children: ReactNode;
}

/** Workbench frame: skip link, header (brand, agency switcher, user), side navigation, main content. */
export function AppShell({ agencySlug, agencies, userName, children }: AppShellProps) {
  const common = useTranslations('common');
  const t = useTranslations('workbench');
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-background focus:p-2"
      >
        {t('skipToContent')}
      </a>
      <header className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2">
        <span className="font-semibold">{common('appName')}</span>
        <AgencySwitcher agencies={agencies} currentSlug={agencySlug} />
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-muted">{t('signedInAs', { name: userName })}</span>
          {/* Auth.js serves its own sign-out page; this must be a full page load, not client routing. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/signout" className="underline">
            {t('signOut')}
          </a>
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-border md:w-56 md:border-r md:border-b-0">
          <Nav agencySlug={agencySlug} />
        </aside>
        <main id="main" className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
