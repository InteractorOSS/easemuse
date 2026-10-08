// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { DefaultsForm } from '@/components/settings/defaults-form';
import { apiFetch } from '@/lib/api-client';
import type { PlatformConfigView } from '@/server/platform/config';

/**
 * /admin → Configuration (FR-ADM-10): the AI routing table and prompt versions (read only: a change
 * is a code change that needs an evaluation run first, NFR-AI05), the feature flags that exist (they are
 * switched per agency on its page), and the settings new agencies start from.
 */
export function ConfigView({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations('admin.config');
  const states = useTranslations('common.states');
  const query = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: ({ signal }) => apiFetch<PlatformConfigView>('/api/admin/v1/config', { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  const { routing, flags } = query.data.data;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <section aria-labelledby="routing-heading" className="flex flex-col gap-2">
        <h2 id="routing-heading" className="text-lg font-semibold">
          {t('routing.title')}
        </h2>
        <p className="text-sm text-muted">{t('routing.intro')}</p>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('routing.title')}</caption>
          <thead>
            <tr className="border-b border-border">
              {(['code', 'purpose', 'model', 'effort', 'prompt', 'maxTokens'] as const).map(
                (key) => (
                  <th key={key} scope="col" className="px-3 py-2 font-medium">
                    {t(`routing.columns.${key}`)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {routing.map((row) => (
              <tr key={row.purpose} className="border-b border-border">
                <th scope="row" className="px-3 py-2 font-medium">
                  {row.code}
                </th>
                <td className="px-3 py-2">{row.purpose}</td>
                <td className="px-3 py-2">{row.model}</td>
                <td className="px-3 py-2">{row.effort}</td>
                <td className="px-3 py-2">{row.promptVersion ?? t('routing.noPrompt')}</td>
                <td className="px-3 py-2">{row.maxTokens}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="flags-heading" className="flex flex-col gap-2">
        <h2 id="flags-heading" className="text-lg font-semibold">
          {t('flags.title')}
        </h2>
        <p className="text-sm text-muted">{t('flags.intro')}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {flags.map((flag) => (
            <li key={flag.key}>
              <span className="font-medium">{t(`flags.names.${flag.key}`)}</span>
              {': '}
              {t(`flags.about.${flag.key}`)}{' '}
              {flag.default ? t('flags.onByDefault') : t('flags.offByDefault')}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="defaults-heading" className="flex flex-col gap-2">
        <h2 id="defaults-heading" className="text-lg font-semibold">
          {t('defaults.title')}
        </h2>
        <DefaultsForm
          agencyId="platform"
          canEdit={canWrite}
          endpoint="/api/admin/v1/config/new-agency-defaults"
          title={t('defaults.formTitle')}
          intro={t('defaults.intro')}
        />
      </section>
    </div>
  );
}
