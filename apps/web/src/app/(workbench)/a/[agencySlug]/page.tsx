// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { getTranslations } from 'next-intl/server';
import { requireAgency } from '@/lib/auth/authorize';

export default async function AgencyHomePage({
  params,
}: {
  params: Promise<{ agencySlug: string }>;
}) {
  const { agencySlug } = await params;
  const access = await requireAgency(agencySlug);
  const t = await getTranslations('workbench');
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('welcome', { agency: access.agency.name })}</h1>
      <p className="mt-2 text-muted">{t('yourRole', { role: t(`roles.${access.role}`) })}</p>
    </>
  );
}
