// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { AgencySummary } from '@/server/tenancy/agencies';
import { AgencyCreateDialog } from './agency-create-dialog';

const STATUSES = ['trial', 'active', 'suspended', 'closed'] as const;

/** /admin/agencies: search, filter and page through agencies; owners and admins can create. */
export function AgenciesView({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations('admin.agencies');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ['admin', 'agencies', q, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '25' });
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<AgencySummary[]>(`/api/admin/v1/agencies?${params}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {canWrite ? <AgencyCreateDialog /> : null}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <TextField
          label={t('search')}
          type="search"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={t('statusFilter')}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`status.${value}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? (
        <div role="alert" className="flex items-center gap-3 text-danger">
          <span>{states('error')}</span>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {states('retry')}
          </Button>
        </div>
      ) : null}

      {query.isSuccess && rows.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['name', 'slug', 'status', 'region', 'members', 'created'] as const).map(
                  (column) => (
                    <th key={column} scope="col" className="px-3 py-2 font-medium">
                      {t(`columns.${column}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((agency) => (
                <tr key={agency.id} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">
                    <Link href={`/admin/agencies/${agency.id}`} className="underline">
                      {agency.name}
                    </Link>
                  </th>
                  <td className="px-3 py-2">{agency.slug}</td>
                  <td className="px-3 py-2">
                    <Badge variant={agency.status === 'suspended' ? 'draft' : 'neutral'}>
                      {t(`status.${agency.status}`)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{agency.region.toUpperCase()}</td>
                  <td className="px-3 py-2">{agency.activeMembers}</td>
                  <td className="px-3 py-2">
                    {format.dateTime(new Date(agency.createdAt), { dateStyle: 'medium' })}
                  </td>
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
