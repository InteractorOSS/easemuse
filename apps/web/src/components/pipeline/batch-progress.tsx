// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { BatchProgress as Progress } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { useChannel } from '@/lib/realtime/use-channel';

interface JobView {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: Progress | null;
  error: string | null;
}

/** Shows a running batch analysis candidate by candidate (T-3-05). Live updates nudge a refetch; polling is the fallback. */
export function BatchProgress({
  agencyId,
  jobRunId,
  names,
  onFinished,
  onClose,
}: {
  agencyId: string;
  jobRunId: string;
  /** Candidate names by pipeline entry id. */
  names: Record<string, string>;
  onFinished: () => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('pipeline.batch');
  const queryClient = useQueryClient();
  const key = ['job', agencyId, jobRunId];
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const res = await apiFetch<JobView>(`/api/v1/agencies/${agencyId}/jobs/${jobRunId}`, {
        signal,
      });
      if (res.data.status === 'succeeded' || res.data.status === 'failed') await onFinished();
      return res;
    },
    refetchInterval: (q) =>
      q.state.data?.data.status === 'succeeded' || q.state.data?.data.status === 'failed'
        ? false
        : 3000,
  });
  useChannel(`job:${jobRunId}`, () => void queryClient.invalidateQueries({ queryKey: key }));

  const job = query.data?.data;
  const progress = job?.progress ?? null;
  const finished = job?.status === 'succeeded' || job?.status === 'failed';
  return (
    <section
      aria-labelledby="batch-heading"
      className="flex max-w-xl flex-col gap-2 rounded-md border border-border p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="batch-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        {finished ? (
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('close')}
          </Button>
        ) : null}
      </div>
      {job?.status === 'failed' && !progress ? <p role="alert">{t('failed')}</p> : null}
      {progress ? (
        <>
          <progress
            max={progress.total}
            value={progress.completed + progress.failed + progress.skipped}
            className="w-full"
            aria-label={t('title')}
          />
          <p role="status">
            {finished
              ? t('done', {
                  completed: progress.completed,
                  failed: progress.failed,
                  skipped: progress.skipped,
                })
              : t('running', {
                  completed: progress.completed + progress.failed + progress.skipped,
                  total: progress.total,
                })}
          </p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {Object.entries(progress.entries).map(([entryId, e]) => (
              <li key={entryId}>
                {t('candidate', {
                  name: names[entryId] ?? entryId,
                  status: t(`status.${e.status}`),
                })}
                {e.reason
                  ? ` (${t.has(`reasons.${e.reason}`) ? t(`reasons.${e.reason}`) : e.reason})`
                  : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
