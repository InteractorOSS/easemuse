// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import type { TenantDeletionView } from '@/server/tenant/deletion';

/** /admin → Deletions: the permanent record of tenants deleted at contract end (FR-ADM-08, ADR-016). */
export function DeletionsView() {
  const t = useTranslations('admin.deletions');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['admin', 'deletions'],
    queryFn: ({ signal }) =>
      apiFetch<TenantDeletionView[]>('/api/admin/v1/tenant-deletions', { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  const rows = query.data.data;
  const day = (value: string | Date | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium' }) : '-';
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted">{t('empty')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t('title')}</caption>
          <thead>
            <tr className="border-b border-border">
              {(['agency', 'status', 'requestedBy', 'approvedBy', 'finished', 'rows'] as const).map(
                (key) => (
                  <th key={key} scope="col" className="px-3 py-2 font-medium">
                    {t(`columns.${key}`)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <th scope="row" className="px-3 py-2 font-medium">
                  {row.tenantName}{' '}
                  <span className="font-normal text-muted">{`(${row.tenantSlug})`}</span>
                </th>
                <td className="px-3 py-2">
                  <Badge variant={row.status === 'failed' ? 'draft' : 'neutral'}>
                    {t(`status.${row.status}`)}
                  </Badge>
                </td>
                <td className="px-3 py-2">{row.requestedByEmail ?? '-'}</td>
                <td className="px-3 py-2">{row.approvedByEmail ?? '-'}</td>
                <td className="px-3 py-2">{day(row.completedAt ?? row.cancelledAt)}</td>
                <td className="px-3 py-2 text-right">{format.number(row.rowsRemoved)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
