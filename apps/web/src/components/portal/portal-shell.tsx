// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHelpLink } from '@/components/help/help-link';
import { Button } from '@/components/ui/button';

/** Frame of the portals: agency name and colour, a way back to the list, and sign out. Reads well at 360 px. */
export function PortalShell({
  agencyName,
  color,
  logoUrl,
  slug,
  prefix,
  signedIn,
  links,
  children,
}: {
  agencyName: string;
  color: string;
  /** The agency logo (FR-TEN-04); the name beside it already says who it is, so the image is decorative. */
  logoUrl?: string | null;
  slug: string;
  prefix: 'h' | 'c';
  signedIn: boolean;
  links?: { href: string; label: string }[];
  children: ReactNode;
}) {
  const t = useTranslations('portal.shell');
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const signOut = async () => {
    setLeaving(true);
    await fetch(`/api/public/portal/${slug}/signout`, { method: 'POST' });
    router.replace(`/${prefix}/${slug}/enter`);
    router.refresh();
  };
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ ['--brand' as string]: color } as CSSProperties}
    >
      <header className="border-b-4 px-4 py-3" style={{ borderColor: 'var(--brand)' }}>
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/${prefix}/${slug}`}
            className="flex items-center gap-3 text-lg font-semibold"
            style={{ color: 'var(--brand)' }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- the logo is a stored image served by our own route
              <img src={logoUrl} alt="" className="max-h-10 max-w-32 object-contain" />
            ) : null}
            {agencyName}
          </Link>
          <nav className="ml-auto flex flex-wrap items-center gap-3 text-sm">
            <PageHelpLink />
            {signedIn
              ? (links ?? []).map((l) => (
                  <Link key={l.href} href={l.href} className="underline">
                    {l.label}
                  </Link>
                ))
              : null}
            {signedIn ? (
              <Button variant="ghost" size="sm" disabled={leaving} onClick={() => void signOut()}>
                {t('signOut')}
              </Button>
            ) : null}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="px-4 py-4 text-center text-xs text-muted">
        {t('poweredBy', { agency: agencyName })}
      </footer>
    </div>
  );
}
