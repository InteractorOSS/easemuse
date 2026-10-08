// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/query-provider';
import { ToastProvider } from '@/components/ui/toast';
import { resolveLocale } from '@/i18n/config';
import { loadMessages } from '@/i18n/messages';
import { getAgencyDefaultLocale } from '@/lib/db';
import { portalAgency } from '@/server/portal/page-access';

/**
 * Providers shared by every portal page: the agency's language (the portal user has no profile
 * language), TanStack Query and toasts. The agency must exist and be active (else 404).
 */
export async function PortalFrame({ slug, children }: { slug: string; children: ReactNode }) {
  const agency = await portalAgency(slug);
  const locale = resolveLocale({
    agencyLocale: await getAgencyDefaultLocale(agency.id),
    acceptLanguage: (await headers()).get('accept-language'),
  });
  return (
    <NextIntlClientProvider locale={locale} messages={await loadMessages(locale)} timeZone="UTC">
      <QueryProvider>
        <ToastProvider>{children}</ToastProvider>
      </QueryProvider>
    </NextIntlClientProvider>
  );
}
