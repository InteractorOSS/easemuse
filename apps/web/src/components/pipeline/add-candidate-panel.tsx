// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { CandidateSummary } from '@/server/candidates/search';

/** Adds candidates from the agency's database to a position (US-204): search, then Add. */
export function AddCandidatePanel({
  agencyId,
  agencySlug,
  positionId,
  inPosition,
  onAdded,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
  /** Candidate ids already in this position. */
  inPosition: ReadonlySet<string>;
  onAdded: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.add');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deferred = useDeferredValue(text.trim());

  const results = useQuery({
    queryKey: ['candidate-pool', agencyId, 'add', deferred],
    queryFn: ({ signal }) =>
      apiFetch<CandidateSummary[]>(
        `/api/v1/agencies/${agencyId}/candidates?limit=8&q=${encodeURIComponent(deferred)}`,
        { signal },
      ),
    enabled: deferred.length >= 2,
  });
  const add = useMutation({
    mutationFn: (candidate: CandidateSummary) =>
      apiFetch(`/api/v1/agencies/${agencyId}/positions/${positionId}/candidates`, {
        body: { candidateId: candidate.id },
      }).then(() => candidate),
    onSuccess: async (candidate) => {
      setError(null);
      toast({ title: t('addedToast', { name: candidate.fullName }) });
      await queryClient.invalidateQueries({ queryKey: ['review', agencyId, positionId] });
      await onAdded();
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 409 && e.message.includes('closed')
          ? t('errors.closed')
          : t('errors.generic'),
      ),
  });
  const rows = results.data?.data ?? [];

  return (
    <section aria-labelledby="add-heading" className="flex max-w-xl flex-col gap-3">
      <h2 id="add-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <TextField
        label={t('search')}
        hint={t('hint')}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {deferred.length >= 2 && results.isSuccess && rows.length === 0 ? (
        <p className="text-sm text-muted">{t('empty')}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {rows.map((c) => {
          const already = inPosition.has(c.id);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-medium">{c.fullName}</span>{' '}
                <span className="text-muted">
                  {[c.currentTitle, c.location].filter(Boolean).join(' · ')}
                </span>
              </span>
              {already ? (
                <span className="text-muted">{t('added')}</span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t('add', { name: c.fullName })}
                  disabled={add.isPending}
                  onClick={() => add.mutate(c)}
                >
                  {t('add', { name: c.fullName })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Link className="text-sm underline" href={`/a/${agencySlug}/candidates/new`}>
        {t('new')}
      </Link>
    </section>
  );
}
