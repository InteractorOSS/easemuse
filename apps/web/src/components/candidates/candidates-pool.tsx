// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import { highlight, searchTokens } from '@/lib/highlight';
import type { CandidateSummary } from '@/server/candidates/search';

export interface PoolFilters {
  q: string;
  skills: string;
  location: string;
  seniority: string;
  minYears: string;
  maxYears: string;
  tags: string;
}

export const EMPTY_FILTERS: PoolFilters = {
  q: '',
  skills: '',
  location: '',
  seniority: '',
  minYears: '',
  maxYears: '',
  tags: '',
};

/** The talent pool (US-207): text search with filters over everyone in the agency, matches highlighted. */
export function CandidatesPool({
  agencyId,
  agencySlug,
  initial = EMPTY_FILTERS,
}: {
  agencyId: string;
  agencySlug: string;
  initial?: PoolFilters;
}) {
  const t = useTranslations('candidates.pool');
  const states = useTranslations('common.states');
  const [filters, setFilters] = useState<PoolFilters>(initial);
  // Searching waits for a pause in typing, so each key does not start a request.
  const deferred = useDeferredValue(filters);
  const tokens = searchTokens(deferred.q);

  const query = useInfiniteQuery({
    queryKey: ['candidate-pool', agencyId, deferred],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '25' });
      for (const [key, value] of Object.entries(deferred))
        if (value.trim()) params.set(key, value.trim());
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<CandidateSummary[]>(`/api/v1/agencies/${agencyId}/candidates?${params}`, {
        signal,
      });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = Object.values(deferred).some((v) => v.trim() !== '');
  const set = (key: keyof PoolFilters) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link
          href={`/a/${agencySlug}/candidates/new`}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t('add')}
        </Link>
      </div>

      <form
        role="search"
        aria-label={t('searchForm')}
        className="flex flex-col gap-3"
        onSubmit={(e) => e.preventDefault()}
      >
        <TextField
          label={t('search')}
          hint={t('searchHint')}
          type="search"
          value={filters.q}
          onChange={set('q')}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <TextField
            label={t('skills')}
            hint={t('skillsHint')}
            value={filters.skills}
            onChange={set('skills')}
          />
          <TextField
            label={t('tags')}
            hint={t('tagsHint')}
            value={filters.tags}
            onChange={set('tags')}
          />
          <TextField label={t('location')} value={filters.location} onChange={set('location')} />
          <TextField label={t('seniority')} value={filters.seniority} onChange={set('seniority')} />
          <TextField
            label={t('minYears')}
            type="number"
            min={0}
            max={60}
            value={filters.minYears}
            onChange={set('minYears')}
          />
          <TextField
            label={t('maxYears')}
            type="number"
            min={0}
            max={60}
            value={filters.maxYears}
            onChange={set('maxYears')}
          />
        </div>
        {filtered ? (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              {t('clear')}
            </Button>
          </div>
        ) : null}
      </form>

      {query.isPending ? <p role="status">{states('loading')}</p> : null}
      {query.isError ? <p role="alert">{states('error')}</p> : null}
      {query.isSuccess && rows.length === 0 ? (
        <p className="text-muted">{filtered ? t('emptyFiltered') : t('empty')}</p>
      ) : null}
      {rows.length > 0 ? (
        <>
          <p role="status" className="text-sm text-muted">
            {t('results', { count: rows.length })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t('title')}</caption>
              <thead>
                <tr className="border-b border-border">
                  {(
                    ['name', 'title', 'location', 'seniority', 'experience', 'skills'] as const
                  ).map((c) => (
                    <th key={c} scope="col" className="px-3 py-2 font-medium">
                      {t(`columns.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-border align-top">
                    <th scope="row" className="px-3 py-2 font-medium">
                      <Link href={`/a/${agencySlug}/candidates/${c.id}`} className="underline">
                        {highlight(c.fullName, tokens)}
                      </Link>
                      {c.doNotContact ? (
                        <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-xs text-danger">
                          {t('doNotContact')}
                        </span>
                      ) : null}
                    </th>
                    <td className="px-3 py-2">
                      {c.currentTitle ? highlight(c.currentTitle, tokens) : t('unknown')}
                    </td>
                    <td className="px-3 py-2">
                      {c.location ? highlight(c.location, tokens) : t('unknown')}
                    </td>
                    <td className="px-3 py-2">{c.seniority ?? t('unknown')}</td>
                    <td className="px-3 py-2">
                      {c.yearsExperience === null
                        ? t('unknown')
                        : t('years', { count: c.yearsExperience })}
                    </td>
                    <td className="px-3 py-2">
                      {highlight(c.skills.slice(0, 6).join(', '), tokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
