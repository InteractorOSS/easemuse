// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { resolveLocale } from '@/i18n/config';
import { loadMessages } from '@/i18n/messages';
import { requireAgency } from '@/lib/auth/authorize';
import { getAgencyDefaultLocale } from '@/lib/db';
import { ApiError } from '@/lib/http/errors';
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
  let access;
  try {
    access = await requireAgency(agencySlug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/a/${agencySlug}`)}`);
    }
    if (error instanceof ApiError) notFound();
    throw error;
  }

  const me = await getMe(access.userId);
  const locale = resolveLocale({
    userLocale: me.user.locale,
    agencyLocale: await getAgencyDefaultLocale(access.agency.id),
    acceptLanguage: (await headers()).get('accept-language'),
  });

  return (
    <NextIntlClientProvider locale={locale} messages={await loadMessages(locale)}>
      <ToastProvider>
        <TooltipProvider>
          <AppShell
            agencySlug={access.agency.slug}
            agencies={me.memberships.map((m) => ({ slug: m.slug, name: m.name }))}
            userName={me.user.name ?? me.user.email}
          >
            {children}
          </AppShell>
        </TooltipProvider>
      </ToastProvider>
    </NextIntlClientProvider>
  );
}
