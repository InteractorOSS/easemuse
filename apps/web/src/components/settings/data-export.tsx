// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { TenantExportView } from '@/server/tenant/export';

const POLL_MS = 3000;

/**
 * Settings → Data export (admin): a ZIP of everything the agency holds, as JSON lines plus the stored
 * files (FR-TEN-06). It is built in the background; this page shows where it stands and the download.
 */
export function DataExport({ agencyId }: { agencyId: string }) {
  const t = useTranslations('settings.export');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const path = `/api/v1/agencies/${agencyId}/data-export`;

  const query = useQuery({
    queryKey: ['data-export', agencyId],
    queryFn: ({ signal }) => apiFetch<TenantExportView[]>(path, { signal }),
    refetchInterval: (q) =>
      q.state.data?.data.some((e) => e.status === 'queued' || e.status === 'running')
        ? POLL_MS
        : false,
  });
  const start = useMutation({
    mutationFn: () => apiFetch(path, { method: 'POST' }),
    onSuccess: async () => {
      toast({ title: t('started') });
      await queryClient.invalidateQueries({ queryKey: ['data-export', agencyId] });
    },
    onError: (error) =>
      toast({
        title: error instanceof ApiClientError && error.status === 409 ? t('busy') : t('failed'),
        variant: 'danger',
      }),
  });

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  const exports = query.data.data;
  const busy = exports.some((e) => e.status === 'queued' || e.status === 'running');
  const size = (bytes: number) =>
    format.number(bytes / 1_048_576, { maximumFractionDigits: 1 }) + ' MB';

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      <div>
        <Button disabled={busy || start.isPending} onClick={() => start.mutate()}>
          {t('start')}
        </Button>
      </div>
      {exports.length === 0 ? (
        <p className="text-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {exports.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {format.dateTime(new Date(item.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                <Badge variant={item.status === 'failed' ? 'draft' : 'neutral'}>
                  {t(`status.${item.status}`)}
                </Badge>
                {item.sizeBytes ? (
                  <span className="text-xs text-muted">{size(item.sizeBytes)}</span>
                ) : null}
              </div>
              {item.status === 'completed' ? (
                // A file download: a normal link so the browser saves it.
                <a href={`${path}/${item.id}/download`} className="text-sm underline">
                  {t('download')}
                </a>
              ) : null}
              {item.status === 'failed' ? (
                <p role="alert" className="text-sm text-danger">
                  {item.error === 'export_too_large' ? t('tooLarge') : t('failed')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
