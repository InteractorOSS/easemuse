// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { OUTBOX_STATUSES } from '@easemuse/core';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { OutboxItem } from '@/server/messaging/outbox-list';

/** Settings → Outbox: what the app sent or captured, with the status of each message (T-5-04). */
export function OutboxList({ agencyId }: { agencyId: string }) {
  const t = useTranslations('settings.outbox');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const [status, setStatus] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['outbox', agencyId, status],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<{ items: OutboxItem[]; nextCursor: string | null }>(
        `/api/v1/agencies/${agencyId}/outbox?${params.toString()}`,
        { signal },
      );
    },
    getNextPageParam: (last) => last.data.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.data.items) ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-muted">{t('intro')}</p>
      <div className="max-w-xs">
        <SelectField label={t('filter')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('all')}</option>
          {OUTBOX_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && items.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {items.map((m) => (
          <li key={m.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{m.subject}</span>
              <Badge
                variant={m.status === 'failed' || m.status === 'bounced' ? 'draft' : 'neutral'}
              >
                {t(`status.${m.status}`)}
              </Badge>
            </div>
            <p className="text-sm text-muted">
              {t('meta', {
                to: m.toAddress,
                kind: m.kind,
                transport: m.transport,
                date: format.dateTime(new Date(m.createdAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </p>
            <details>
              <summary className="cursor-pointer text-sm underline">{t('show')}</summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm">{m.bodyText}</pre>
            </details>
            {m.lastError ? (
              <p role="alert" className="text-sm text-danger">
                {m.lastError}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('more')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
