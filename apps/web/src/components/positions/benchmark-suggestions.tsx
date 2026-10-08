// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { BenchmarkView } from '@/server/benchmark/service';

/**
 * Suggested JD changes (US-108), accepted or rejected one by one. Deciding needs the APPROVED
 * report: before that the list is read-only. An accepted change goes into a new draft of the
 * structured JD, which the recruiter still approves on its own page.
 */
export function BenchmarkSuggestions({
  agencyId,
  agencySlug,
  positionId,
  view,
}: {
  agencyId: string;
  agencySlug: string;
  positionId: string;
  view: BenchmarkView;
}) {
  const t = useTranslations('intelligence.benchmark.suggestions');
  const sections = useTranslations('positions.jdSections');
  const categories = useTranslations('positions.categories');
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const approved = view.versionStatus === 'approved';
  const base = `/api/v1/agencies/${agencyId}/positions/${positionId}/benchmark/suggestions`;

  const decide = useMutation({
    mutationFn: (input: { id: string; decision: 'accepted' | 'rejected' }) =>
      apiFetch<{ decision: string; appliedVersionId: string | null }>(`${base}/${input.id}`, {
        body: { versionId: view.versionId, decision: input.decision },
      }),
    onSuccess: async (result, input) => {
      setError(null);
      if (result.data.appliedVersionId) setApplied((s) => new Set(s).add(input.id));
      await queryClient.invalidateQueries({ queryKey: ['benchmark', agencyId, positionId] });
      await queryClient.invalidateQueries({ queryKey: ['structured-jd', agencyId, positionId] });
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError && e.status === 409
          ? e.message || t('errors.conflict')
          : t('errors.generic'),
      ),
  });

  const content = view.content;
  if (!content) return null;
  return (
    <section aria-labelledby="bm-suggestions" className="flex flex-col gap-3">
      <h2 id="bm-suggestions" className="text-lg font-semibold">
        {t('heading')}
      </h2>
      <p className="text-sm text-muted">{t('hint')}</p>
      {!approved && content.suggestions.length > 0 ? (
        <p className="text-sm">{t('needsApproval')}</p>
      ) : null}
      {approved && !view.hasStructuredJd ? <p className="text-sm">{t('noJd')}</p> : null}
      {content.suggestions.length === 0 ? <p className="text-sm">{t('empty')}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {content.suggestions.map((s) => {
          const decision = view.decisions[s.id];
          const replaces = s.requirementId ? view.requirementTexts[s.requirementId] : undefined;
          return (
            <li key={s.id} className="flex flex-col gap-2 rounded-2xl border border-border p-4">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Badge>{t(`kind.${s.kind}`)}</Badge>
                <span className="text-muted">
                  {sections(s.section)}
                  {s.category ? ` · ${categories(s.category)}` : ''}
                </span>
              </p>
              <p className="text-sm font-medium">{s.text}</p>
              {replaces ? (
                <p className="text-xs text-muted">{t('replaces', { text: replaces })}</p>
              ) : null}
              <p className="text-sm">{s.rationale}</p>
              <p className="text-xs text-muted">{t('basedOn', { ids: s.basedOn.join(', ') })}</p>
              {decision ? (
                <p className="text-sm" role="status">
                  <Badge>{t(decision)}</Badge>
                  {decision === 'accepted' && applied.has(s.id) ? (
                    <>
                      {' '}
                      <Link
                        className="underline"
                        href={`/a/${agencySlug}/positions/${positionId}/structure`}
                      >
                        {t('openJd')}
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : approved ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={decide.isPending || !view.hasStructuredJd}
                    aria-label={t('acceptLabel', { text: s.text })}
                    onClick={() => decide.mutate({ id: s.id, decision: 'accepted' })}
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={decide.isPending}
                    aria-label={t('rejectLabel', { text: s.text })}
                    onClick={() => decide.mutate({ id: s.id, decision: 'rejected' })}
                  >
                    {t('reject')}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
