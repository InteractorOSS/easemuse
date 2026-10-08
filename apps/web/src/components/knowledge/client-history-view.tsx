// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api-client';
import type { ClientHistory } from '@/server/knowledge/history';
import { HistoryTab } from './history-tab';
import { PatternReports } from './pattern-reports';
import { PatternSummaryPanel } from './pattern-summary-panel';

/** /a/:agency/positions/:id/client-history (US-1201, US-1202): "What has this client liked before?" and the patterns behind it. */
export function ClientHistoryView({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('knowledge');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['client-history', agencyId, positionId],
    queryFn: ({ signal }) =>
      apiFetch<ClientHistory>(
        `/api/v1/agencies/${agencyId}/positions/${positionId}/client-history`,
        { signal },
      ),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{t('loadError')}</p>;
  const history = query.data.data;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('intro', { client: history.client.name })}</p>
          <p className="text-xs text-muted">
            {t('asOf', { date: format.dateTime(new Date(history.asOf), { dateStyle: 'medium' }) })}
          </p>
        </div>
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}`}>
          {t('back')}
        </Link>
      </div>
      <Tabs defaultValue="history">
        <TabsList aria-label={t('tabs.label')}>
          <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
          <TabsTrigger value="patterns">{t('tabs.patterns')}</TabsTrigger>
          <TabsTrigger value="summary">{t('tabs.summary')}</TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <HistoryTab history={history} agencySlug={agencySlug} />
        </TabsContent>
        <TabsContent value="patterns">
          <PatternReports agencyId={agencyId} agencySlug={agencySlug} positionId={positionId} />
        </TabsContent>
        <TabsContent value="summary">
          <PatternSummaryPanel
            agencyId={agencyId}
            agencySlug={agencySlug}
            positionId={positionId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
