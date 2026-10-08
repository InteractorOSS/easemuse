// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/query-provider';
import { AppShell } from '@/components/shell/app-shell';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resolveLocale } from '@/i18n/config';
import { loadMessages } from '@/i18n/messages';
import { agencyAccess } from '@/lib/auth/page-access';
import { getAgencyDefaultLocale } from '@/lib/db';
import { getMe } from '@/server/tenancy/me';

/**
 * Workbench frame for one agency. Membership is checked here on every request (ADR-012): a
 * non-member sees the same 404 as an unknown agency, a signed-out visitor goes to sign-in.
 * The UI language is the user's setting, else the agency default (ADR-015).
 */
export default async function AgencyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await agencyAccess(agencySlug);
  const me = await getMe(access.userId);
  const locale = resolveLocale({
    userLocale: me.user.locale,
    agencyLocale: await getAgencyDefaultLocale(access.agency.id),
    acceptLanguage: (await headers()).get('accept-language'),
  });

  return (
    <NextIntlClientProvider locale={locale} messages={await loadMessages(locale)} timeZone="UTC">
      <ToastProvider>
        <TooltipProvider>
          <QueryProvider>
            <AppShell
              agencySlug={access.agency.slug}
              agencies={
                access.support
                  ? [{ slug: access.agency.slug, name: access.agency.name }]
                  : me.memberships.map((m) => ({ slug: m.slug, name: m.name }))
              }
              userName={me.user.name ?? me.user.email}
              support={
                access.support
                  ? {
                      agencyName: access.agency.name,
                      expiresAt: access.support.expiresAt.toISOString(),
                      exitHref: `/admin/agencies/${access.agency.id}`,
                    }
                  : undefined
              }
            >
              {children}
            </AppShell>
          </QueryProvider>
        </TooltipProvider>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}
