// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { POSITION_STATUSES, type PositionStatus } from '@easemuse/core';
import { SelectField, TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { PositionView } from '@/server/positions/service';

/** /a/:agency/positions: the positions this person may see, with a status filter and title search. */
export function PositionsList({ agencyId, agencySlug }: { agencyId: string; agencySlug: string }) {
  const t = useTranslations('positions');
  const states = useTranslations('common.states');
  const [status, setStatus] = useState<'' | PositionStatus>('');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['positions', agencyId, status, search],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: '100' });
      if (status) params.set('status', status);
      if (search.trim()) params.set('q', search.trim());
      return apiFetch<PositionView[]>(`/api/v1/agencies/${agencyId}/positions?${params}`, {
        signal,
      });
    },
  });
  const positions = query.data?.data ?? [];
  const filtered = status !== '' || search.trim() !== '';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link
          href={`/a/${agencySlug}/positions/new`}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t('new')}
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <SelectField
          label={t('filters.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | PositionStatus)}
        >
          <option value="">{t('filters.allStatuses')}</option>
          {POSITION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('filters.search')}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && positions.length === 0 ? (
        <p className="text-muted">{filtered ? t('emptyFiltered') : t('empty')}</p>
      ) : null}
      {positions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['title', 'client', 'owner', 'status', 'openings'] as const).map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 font-medium">
                    {t(`columns.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">
                    <Link href={`/a/${agencySlug}/positions/${p.id}`} className="underline">
                      {p.title}
                    </Link>
                  </th>
                  <td className="px-3 py-2">{p.clientName}</td>
                  <td className="px-3 py-2">{p.ownerName ?? t('unknownOwner')}</td>
                  <td className="px-3 py-2">{t(`status.${p.status}`)}</td>
                  <td className="px-3 py-2">{p.openings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
