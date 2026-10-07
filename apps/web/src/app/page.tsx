// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getTranslations } from 'next-intl/server';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p>{t('subtitle')}</p>
    </main>
  );
}
