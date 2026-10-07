// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import type { AgencyUsage } from '@/server/tenancy/agency-usage';

/** Settings → AI usage: this month's cost by purpose against the budget (US-1304). */
export function UsageSummary({ agencyId }: { agencyId: string }) {
  const t = useTranslations('settings.usage');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const usd = (n: number) =>
    format.number(n, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  const query = useQuery({
    queryKey: ['agency-usage', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<AgencyUsage>(`/api/v1/agencies/${agencyId}/usage`, { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  const { month, budget, byPurpose, totals } = query.data.data;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">
        {t('title')} <span className="text-base font-normal text-muted">{month}</span>
      </h1>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {budget.limitUsd === null
            ? t('budget.none')
            : t('budget.line', { spent: usd(budget.spentUsd), limit: usd(budget.limitUsd) })}
        </span>
        <Badge variant={budget.level === 'ok' ? 'neutral' : 'draft'}>
          {t(`budget.level.${budget.level}`)}
        </Badge>
      </div>
      {budget.ratio !== null ? (
        <div
          role="img"
          aria-label={t('budget.line', {
            spent: usd(budget.spentUsd),
            limit: usd(budget.limitUsd ?? 0),
          })}
          className="h-2 w-full overflow-hidden rounded-sm bg-surface"
        >
          <div
            className={budget.level === 'ok' ? 'h-full bg-primary' : 'h-full bg-draft-badge'}
            style={{ width: `${Math.min(100, Math.round(budget.ratio * 100))}%` }}
          />
        </div>
      ) : null}
      {byPurpose.length === 0 ? (
        <p className="text-muted">{t('empty')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('byPurpose')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">
                {t('columns.purpose')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t('columns.calls')}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t('columns.cost')}
              </th>
            </tr>
          </thead>
          <tbody>
            {byPurpose.map((row) => (
              <tr key={row.key} className="border-b border-border">
                <th scope="row" className="px-3 py-2 font-medium">
                  {row.key}
                </th>
                <td className="px-3 py-2 text-right">{format.number(row.calls)}</td>
                <td className="px-3 py-2 text-right">{usd(row.costUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <th scope="row" className="px-3 py-2">
                {t('total')}
              </th>
              <td className="px-3 py-2 text-right">{format.number(totals.calls)}</td>
              <td className="px-3 py-2 text-right">{usd(totals.costUsd)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
