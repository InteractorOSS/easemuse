// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getTranslations } from 'next-intl/server';

/** Where members of a suspended agency land (US-1602): a plain explanation, no data. */
export default async function SuspendedPage() {
  const t = await getTranslations('workbench.suspended');
  return (
    <main id="main" className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-3 text-muted">{t('body')}</p>
    </main>
  );
}
