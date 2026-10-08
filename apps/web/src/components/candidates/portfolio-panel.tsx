// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { FIT_LEVELS } from '@easemuse/core';
import { AiDraftBadge } from '@/components/ui/ai-draft-badge';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { PortfolioView } from '@/server/pool/portfolio';

/**
 * "Check open positions" on the candidate page (US-206, brief 4.3): Strong, Moderate or Low fit for
 * each open position, with a reason. Low fits are listed too and positions that were not assessed
 * say why: nothing is hidden. A suggestion for the recruiter; no pipeline is changed.
 */
export function PortfolioPanel({
  agencyId,
  agencySlug,
  candidateId,
}: {
  agencyId: string;
  agencySlug: string;
  candidateId: string;
}) {
  const t = useTranslations('intelligence.portfolio');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/candidates/${candidateId}/portfolio`;
  const key = ['portfolio', agencyId, candidateId];
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<PortfolioView>(url, { signal }),
  });
  const run = useMutation({
    mutationFn: () => apiFetch<PortfolioView>(url, { method: 'POST' }),
    onSuccess: (result) => {
      setError(null);
      queryClient.setQueryData(key, result);
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.status === 402) setError(t('errors.budget'));
      else if (e instanceof ApiClientError && e.status === 409)
        setError(
          /no open position/.test(e.message) ? t('errors.noPositions') : t('errors.noProfile'),
        );
      else setError(t('errors.generic'));
    },
  });
  const view = query.data?.data;

  return (
    <section aria-labelledby="portfolio-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="portfolio-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        {view?.artifactId ? <AiDraftBadge /> : null}
      </div>
      <p className="max-w-2xl text-sm text-muted">{t('intro')}</p>
      <div className="flex items-center gap-3">
        <Button variant="secondary" disabled={run.isPending} onClick={() => run.mutate()}>
          {view?.artifactId ? t('rerun') : t('run')}
        </Button>
        {run.isPending ? <span role="status">{t('working')}</span> : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {view && !view.artifactId ? <p className="text-sm text-muted">{t('none')}</p> : null}
      {view?.generatedOn ? (
        <p className="text-sm text-muted">
          {t('generatedOn', {
            date: format.dateTime(new Date(view.generatedOn), {
              dateStyle: 'medium',
              timeZone: 'UTC',
            }),
          })}
        </p>
      ) : null}
      {view?.truncated ? <p className="text-sm text-muted">{t('truncated')}</p> : null}
      {view && view.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {FIT_LEVELS.flatMap((fit) =>
            view.items
              .filter((i) => i.fit === fit)
              .map((i) => (
                <li
                  key={i.position.id}
                  className="flex flex-col gap-1 rounded-2xl border border-border p-3 text-sm"
                >
                  <p>
                    <span className="font-medium">{t(`fit.${fit}`)}</span>
                    {': '}
                    <Link
                      className="underline"
                      href={`/a/${agencySlug}/positions/${i.position.id}`}
                    >
                      {i.position.title}
                    </Link>{' '}
                    <span className="text-muted">
                      {[i.position.clientName, i.position.location].filter(Boolean).join(' · ')}
                    </span>
                  </p>
                  <p>{i.reason}</p>
                </li>
              )),
          )}
        </ul>
      ) : null}
      {view && view.notAssessed.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{t('notAssessed')}</h3>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {view.notAssessed.map((n) => (
              <li key={n.position.id}>
                <Link className="underline" href={`/a/${agencySlug}/positions/${n.position.id}`}>
                  {n.position.title}
                </Link>
                {n.position.clientName ? ` · ${n.position.clientName}` : ''}
                {' — '}
                {t(`why.${n.why}`)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
