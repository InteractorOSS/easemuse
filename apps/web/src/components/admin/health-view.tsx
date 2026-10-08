// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SelectField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { HealthSnapshot } from '@/server/platform/health';

const WINDOWS = [1, 24, 72, 168];
const REFRESH_MS = 30_000;

/**
 * /admin → System health (FR-ADM-09): job queues and failures, mail that did not go out, and AI errors
 * and refusals, per agency. It shows counts and ids only, never any content.
 */
export function HealthView() {
  const t = useTranslations('admin.health');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const [hours, setHours] = useState('24');
  const query = useQuery({
    queryKey: ['admin', 'health', hours],
    queryFn: ({ signal }) =>
      apiFetch<HealthSnapshot>(`/api/admin/v1/health?hours=${hours}`, { signal }),
    refetchInterval: REFRESH_MS,
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  const snapshot = query.data.data;
  const percent = (value: number | null) =>
    value === null ? '-' : format.number(value, { style: 'percent', maximumFractionDigits: 0 });
  const when = (value: string | Date | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'short', timeStyle: 'short' }) : '-';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted">{t('intro')}</p>
        </div>
        <div className="ml-auto w-48">
          <SelectField label={t('window')} value={hours} onChange={(e) => setHours(e.target.value)}>
            {WINDOWS.map((h) => (
              <option key={h} value={h}>
                {t('windowOption', { hours: h })}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      <p className="text-xs text-muted">{t('generated', { when: when(snapshot.generatedAt) })}</p>

      <section aria-labelledby="queues-heading" className="flex flex-col gap-2">
        <h2 id="queues-heading" className="text-lg font-semibold">
          {t('queues.title')}
        </h2>
        {snapshot.queues.length === 0 ? (
          <p className="text-muted">{t('queues.empty')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('queues.title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['queue', 'queued', 'running', 'succeeded', 'failed', 'oldest'] as const).map(
                  (key) => (
                    <th key={key} scope="col" className="px-3 py-2 font-medium">
                      {t(`queues.columns.${key}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {snapshot.queues.map((q) => (
                <tr key={q.queue} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {q.queue}
                  </th>
                  <td className="px-3 py-2">{q.queued}</td>
                  <td className="px-3 py-2">{q.running}</td>
                  <td className="px-3 py-2">{q.succeeded}</td>
                  <td className="px-3 py-2">
                    {q.failed > 0 ? <Badge variant="draft">{q.failed}</Badge> : q.failed}
                  </td>
                  <td className="px-3 py-2">{when(q.oldestQueuedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="agencies-heading" className="flex flex-col gap-2">
        <h2 id="agencies-heading" className="text-lg font-semibold">
          {t('agencies.title')}
        </h2>
        {snapshot.agencies.length === 0 ? (
          <p className="text-muted">{t('agencies.empty')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('agencies.title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(
                  [
                    'agency',
                    'jobsFailed',
                    'mailFailed',
                    'mailStuck',
                    'generations',
                    'errorRate',
                    'refusalRate',
                  ] as const
                ).map((key) => (
                  <th key={key} scope="col" className="px-3 py-2 font-medium">
                    {t(`agencies.columns.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.agencies.map((a) => (
                <tr key={a.agencyId} className="border-b border-border">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {a.agencyName}{' '}
                    {a.needsAttention ? (
                      <Badge variant="draft">{t('agencies.attention')}</Badge>
                    ) : null}
                  </th>
                  <td className="px-3 py-2">{a.jobsFailed}</td>
                  <td className="px-3 py-2">{a.outbox.failed + a.outbox.bounced}</td>
                  <td className="px-3 py-2">{a.outbox.stuck}</td>
                  <td className="px-3 py-2">{a.ai.generations}</td>
                  <td className="px-3 py-2">{percent(a.ai.errorRate)}</td>
                  <td className="px-3 py-2">{percent(a.ai.refusalRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="failed-heading" className="flex flex-col gap-2">
        <h2 id="failed-heading" className="text-lg font-semibold">
          {t('failed.title')}
        </h2>
        <p className="text-sm text-muted">{t('failed.intro')}</p>
        {snapshot.failedJobs.length === 0 ? (
          <p className="text-muted">{t('failed.empty')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('failed.title')}</caption>
            <thead>
              <tr className="border-b border-border">
                {(['when', 'job', 'agency', 'id'] as const).map((key) => (
                  <th key={key} scope="col" className="px-3 py-2 font-medium">
                    {t(`failed.columns.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.failedJobs.map((job) => (
                <tr key={job.id} className="border-b border-border">
                  <td className="px-3 py-2">{when(job.createdAt)}</td>
                  <td className="px-3 py-2">{`${job.queue}:${job.name}`}</td>
                  <td className="px-3 py-2">{job.agencyName ?? t('failed.system')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{job.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
