// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import type { TimelineEntry } from '@/server/activity/service';

/**
 * The timeline of one entity (position, candidate, pipeline entry...): who did what, newest first
 * (US-007). Actions without a friendly label show their raw name rather than being hidden.
 */
export function EntityTimeline({
  agencyId,
  entityType,
  entityId,
}: {
  agencyId: string;
  entityType: string;
  entityId: string;
}) {
  const t = useTranslations('activity');
  const states = useTranslations('common.states');
  const format = useFormatter();

  const query = useInfiniteQuery({
    queryKey: ['timeline', agencyId, entityType, entityId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ entityType, entityId, limit: '25' });
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<TimelineEntry[]>(`/api/v1/agencies/${agencyId}/activity?${params}`, {
        signal,
      });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const entries = query.data?.pages.flatMap((p) => p.data) ?? [];
  const label = (action: string) => {
    const key = `actions.${action.replaceAll('.', '_')}`;
    return t.has(key) ? t(key) : t('unknownAction', { action });
  };

  return (
    <section aria-labelledby={`timeline-${entityId}`} className="flex flex-col gap-3">
      <h2 id={`timeline-${entityId}`} className="text-lg font-semibold">
        {t('title')}
      </h2>
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && entries.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      <ol className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <time dateTime={new Date(entry.createdAt).toISOString()} className="text-muted">
              {format.dateTime(new Date(entry.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </time>
            <span className="font-medium">
              {entry.actorType === 'system' ? t('bySystem') : (entry.actorName ?? t('someone'))}
            </span>
            <span>{label(entry.action)}</span>
          </li>
        ))}
      </ol>
      {query.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
