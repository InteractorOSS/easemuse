// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * Shown on every page while a platform administrator looks into an agency under a support grant
 * (FR-ADM-07): who they are, that it is read-only, until when, and that every page they open is
 * recorded in the agency's activity log.
 */
export function SupportBanner({
  agencyName,
  expiresAt,
  exitHref,
}: {
  agencyName: string;
  expiresAt: string;
  exitHref: string;
}) {
  const t = useTranslations('workbench.support');
  const format = useFormatter();
  return (
    <div
      role="region"
      aria-label={t('label')}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-draft-badge-background px-4 py-2 text-sm text-draft-badge"
    >
      <strong>{t('title', { agency: agencyName })}</strong>
      <span>
        {t('detail', {
          until: format.dateTime(new Date(expiresAt), { dateStyle: 'medium', timeStyle: 'short' }),
        })}
      </span>
      <Link href={exitHref} className="ml-auto font-medium underline">
        {t('exit')}
      </Link>
    </div>
  );
}
