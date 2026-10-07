// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getPlatformUser } from '@/lib/db';
import { resolveLocale } from './config';
import { loadMessages } from './messages';

/**
 * Per-request locale for next-intl. The agency default is applied by the workbench layout, which
 * knows the agency; here we resolve what every route can: user setting, then browser, then English.
 */
export default getRequestConfig(async () => {
  let userLocale: string | null = null;
  try {
    const session = await auth();
    if (session?.user?.id) userLocale = (await getPlatformUser(session.user.id))?.locale ?? null;
  } catch {
    // No session or database (build, health probe): fall through to the browser language.
  }
  const locale = resolveLocale({
    userLocale,
    acceptLanguage: (await headers()).get('accept-language'),
  });
  return { locale, messages: await loadMessages(locale) };
});
