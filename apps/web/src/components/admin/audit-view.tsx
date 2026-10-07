// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { AuditEntry } from '@/lib/db/platform';

/** /admin/audit: every platform action, newest first (FR-ADM-06). Never shows agency content. */
export function AuditView() {
  const t = useTranslations('admin.audit');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const [typed, setTyped] = useState('');
  const [action, setAction] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setAction(typed.trim()), 300);
    return () => clearTimeout(handle);
  }, [typed]);

  const query = useInfiniteQuery({
    queryKey: ['admin', 'audit', action],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (action) params.set('action', action);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<AuditEntry[]>(`/api/admin/v1/audit?${params}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <TextField
        label={t('action')}
        placeholder={t('actionPlaceholder')}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && rows.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['when', 'who', 'action', 'agency', 'target'] as const).map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-medium">
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} className="border-b border-border">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {format.dateTime(new Date(entry.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-3 py-2">{entry.adminEmail ?? t('system')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{entry.action}</td>
                  <td className="px-3 py-2">{entry.agencyName ?? ''}</td>
                  <td className="px-3 py-2">{entry.targetType ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {query.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
