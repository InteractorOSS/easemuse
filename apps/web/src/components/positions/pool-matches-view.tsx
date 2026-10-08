// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AiDraftBadge } from '@/components/ui/ai-draft-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { PoolMatchesView } from '@/server/pool/similar';

/**
 * /a/:agency/positions/:id/pool (US-205, brief 4.3): "Find in my pool". The recruiter asks, the
 * assistant suggests existing candidates with a line each, and nothing is added to the position
 * until the recruiter presses "Add". The similarity figure is shown as a reference only.
 */
export function PoolMatchesViewPage({
  agencyId,
  agencySlug,
  positionId,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
}) {
  const t = useTranslations('intelligence.pool');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}`;
  const key = ['pool-matches', agencyId, positionId];
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<PoolMatchesView>(`${base}/pool-matches`, { signal }),
  });
  const explain = (e: unknown, fallback: 'generic' | 'add'): string => {
    if (e instanceof ApiClientError) {
      if (e.status === 409 && fallback === 'generic') return t('errors.notConfirmed');
      if (e.status === 402) return t('errors.budget');
    }
    return t(`errors.${fallback}`);
  };
  const run = useMutation({
    mutationFn: () => apiFetch<PoolMatchesView>(`${base}/pool-matches`, { method: 'POST' }),
    onSuccess: (result) => {
      setError(null);
      queryClient.setQueryData(key, result);
    },
    onError: (e) => setError(explain(e, 'generic')),
  });
  const add = useMutation({
    mutationFn: (candidateId: string) =>
      apiFetch(`${base}/candidates`, { method: 'POST', body: { candidateId } }),
    onSuccess: async (_result, candidateId) => {
      setError(null);
      setAdded((current) => new Set(current).add(candidateId));
      toast({ title: t('addedToast') });
      await queryClient.invalidateQueries({ queryKey: ['pipeline', agencyId, positionId] });
    },
    onError: (e) => setError(explain(e, 'add')),
  });

  const view = query.data?.data;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link className="underline" href={`/a/${agencySlug}/positions/${positionId}`}>
          {t('back')}
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <p className="max-w-2xl text-sm text-muted">{t('intro')}</p>
        <div className="flex items-center gap-3">
          <Button disabled={run.isPending} onClick={() => run.mutate()}>
            {view?.artifactId ? t('rerun') : t('run')}
          </Button>
          {run.isPending ? <span role="status">{t('working')}</span> : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}

      {view ? (
        <section aria-labelledby="pool-results" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="pool-results" className="text-lg font-semibold">
              {t('resultsHeading')}
            </h2>
            {view.artifactId ? <AiDraftBadge /> : null}
          </div>
          <div className="flex flex-col gap-1 text-sm text-muted">
            {view.generatedOn ? (
              <p>
                {t('searchedOn', {
                  date: format.dateTime(new Date(view.generatedOn), {
                    dateStyle: 'medium',
                    timeZone: 'UTC',
                  }),
                })}{' '}
                {view.basis ? t(`basis.${view.basis}`) : null}
              </p>
            ) : null}
            <p>
              {t('coverage', { poolSize: view.poolSize, notIndexed: view.notIndexed })}
              {view.alreadyInPosition > 0
                ? ` ${t('alreadyIn', { count: view.alreadyInPosition })}`
                : ''}
            </p>
          </div>
          {view.artifactId && view.items.length === 0 ? (
            <p className="text-sm">{t('none')}</p>
          ) : null}
          {view.items.length > 0 ? <p className="text-sm text-muted">{t('suggestion')}</p> : null}
          <ul className="flex flex-col gap-3">
            {view.items.map((item) => {
              const c = item.candidate;
              const isAdded = added.has(c.id);
              return (
                <li key={c.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        <Link className="underline" href={`/a/${agencySlug}/candidates/${c.id}`}>
                          {c.fullName}
                        </Link>
                        {c.doNotContact ? (
                          <Badge className="ml-2" variant="draft">
                            {t('dnc')}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-sm text-muted">
                        {[c.currentTitle, c.location].filter(Boolean).join(' · ')}
                      </p>
                      {c.skills.length > 0 ? (
                        <p className="text-sm text-muted">{c.skills.join(', ')}</p>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isAdded || add.isPending}
                      aria-label={t('addLabel', { name: c.fullName })}
                      onClick={() => add.mutate(c.id)}
                    >
                      {isAdded ? t('added') : add.isPending ? t('adding') : t('add')}
                    </Button>
                  </div>
                  <p className="text-sm">{item.reason}</p>
                  {item.caveat ? (
                    <p className="text-sm text-muted">{t('caveat', { text: item.caveat })}</p>
                  ) : null}
                  {item.similarity !== null ? (
                    <p className="text-xs text-muted">
                      {t('similarity', {
                        value: format.number(item.similarity, { maximumFractionDigits: 2 }),
                      })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
