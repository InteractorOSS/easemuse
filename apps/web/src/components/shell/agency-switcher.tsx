// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { useTranslations } from 'next-intl';

export interface AgencyOption {
  slug: string;
  name: string;
}

/** Lists the agencies the user belongs to (from /api/v1/me); picking one opens its workbench. */
export function AgencySwitcher({
  agencies,
  currentSlug,
}: {
  agencies: AgencyOption[];
  currentSlug: string;
}) {
  const t = useTranslations('nav');
  const router = useRouter();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t('agencySwitcher')}
      </label>
      <select
        id={id}
        value={currentSlug}
        onChange={(event) => router.push(`/a/${event.target.value}`)}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        {agencies.map((agency) => (
          <option key={agency.slug} value={agency.slug}>
            {agency.name}
          </option>
        ))}
      </select>
    </div>
  );
}
