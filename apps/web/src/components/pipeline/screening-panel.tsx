// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  SCREENING_CLASSES,
  SCREENING_ITEMS,
  SCREENING_RATINGS,
  type ScreeningClassValue,
  type ScreeningItems,
  type ScreeningRating,
} from '@easemuse/core';
import { StreamingDraft } from '@/components/artifacts/streaming-draft';
import { useAiRun } from '@/components/artifacts/use-ai-run';
import { AiDraftBadge } from '@/components/ui/ai-draft-badge';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';

interface ScreeningView {
  items: ScreeningItems;
  screeningClass: ScreeningClassValue | null;
}

/** The 14-item screening checklist and the recruiter's classification (T-4-01, T-4-02, brief 6). */
export function ScreeningPanel({
  agencyId,
  entryId,
  readOnly,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  readOnly?: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.screening');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/pipeline/${entryId}`;
  const key = ['screening', agencyId, entryId];
  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<ScreeningView>(`${url}/screening`, { signal }),
  });
  const suggestions = useQuery({
    queryKey: ['screening-prefill', agencyId, entryId],
    queryFn: ({ signal }) =>
      apiFetch<{
        items: Record<
          (typeof SCREENING_ITEMS)[number],
          { rating: ScreeningRating | null; note: string }
        >;
      } | null>(`${url}/screening/prefill`, { signal }),
  });
  const run = useAiRun(`${url}/screening/prefill`, {
    onDone: () =>
      void queryClient.invalidateQueries({ queryKey: ['screening-prefill', agencyId, entryId] }),
  });
  const [edits, setEdits] = useState<ScreeningItems>({});
  const [target, setTarget] = useState<'' | ScreeningClassValue>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => apiFetch(`${url}/screening`, { method: 'PUT', body: { items: edits } }),
    onSuccess: async () => {
      setEdits({});
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const classify = useMutation({
    mutationFn: () =>
      apiFetch(`${url}/classification`, {
        body: { screeningClass: target, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }),
    onSuccess: async () => {
      setTarget('');
      setReason('');
      setError(null);
      toast({ title: t('classified') });
      await queryClient.invalidateQueries({ queryKey: key });
      await onChanged();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t('reasonRequired')),
  });

  if (!view.data) return null;
  const saved = view.data.data.items;
  const current = view.data.data.screeningClass;
  const valueOf = (item: (typeof SCREENING_ITEMS)[number]) => ({
    rating: edits[item]?.rating ?? (edits[item] ? null : (saved[item]?.rating ?? null)),
    notes: edits[item]?.notes ?? saved[item]?.notes ?? '',
  });
  const patch = (
    item: (typeof SCREENING_ITEMS)[number],
    next: { rating?: ScreeningRating | null; notes?: string },
  ) => setEdits((e) => ({ ...e, [item]: { ...valueOf(item), ...next } }));
  const dirty = Object.keys(edits).length > 0;
  const suggested = suggestions.data?.data?.items;
  const applySuggestion = (item: (typeof SCREENING_ITEMS)[number]) => {
    const s = suggested?.[item];
    if (s && (s.rating || s.note))
      setEdits((e) => ({ ...e, [item]: { rating: s.rating, notes: s.note } }));
  };
  const withSuggestion = suggested
    ? SCREENING_ITEMS.filter((k) => suggested[k].rating || suggested[k].note)
    : [];

  return (
    <section aria-labelledby="screening-heading" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="screening-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
      </div>
      {readOnly ? null : (
        <div className="flex flex-col gap-2">
          <div>
            <Button
              variant="secondary"
              size="sm"
              disabled={run.state.status === 'running'}
              onClick={() => void run.start()}
            >
              {t('suggest')}
            </Button>
          </div>
          <StreamingDraft
            state={run.state}
            onCancel={run.cancel}
            onRetry={() => void run.start()}
          />
          {suggested ? (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">{t('suggestionsTitle')}</h3>
                <AiDraftBadge />
              </div>
              <p className="text-sm text-muted">{t('suggestionsHint')}</p>
              {withSuggestion.length === 0 ? (
                <p className="text-sm">{t('noSuggestions')}</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1 text-sm">
                    {withSuggestion.map((item) => (
                      <li key={item} className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">
                          {t('suggestionLine', {
                            item: t(`items.${item}`),
                            rating: suggested[item].rating
                              ? t(`ratings.${suggested[item].rating}`)
                              : t('noRating'),
                          })}
                        </span>
                        <span className="text-muted">{suggested[item].note}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t('useFor', { item: t(`items.${item}`) })}
                          onClick={() => applySuggestion(item)}
                        >
                          {t('use')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => withSuggestion.forEach(applySuggestion)}
                    >
                      {t('useAll')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {SCREENING_ITEMS.map((item) => {
          const v = valueOf(item);
          const label = t(`items.${item}`);
          return (
            <li key={item} className="grid gap-2 sm:grid-cols-[14rem_9rem_1fr] sm:items-end">
              <span className="text-sm font-medium">{label}</span>
              <SelectField
                label={t('rating', { item: label })}
                disabled={readOnly}
                value={v.rating ?? ''}
                onChange={(e) =>
                  patch(item, { rating: (e.target.value || null) as ScreeningRating | null })
                }
              >
                <option value="">{t('noRating')}</option>
                {SCREENING_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {t(`ratings.${r}`)}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={t('notes', { item: label })}
                readOnly={readOnly}
                value={v.notes}
                onChange={(e) => patch(item, { notes: e.target.value })}
              />
            </li>
          );
        })}
      </ul>
      {readOnly ? null : (
        <div>
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        </div>
      )}

      <div className="flex max-w-md flex-col gap-2">
        <h3 className="font-medium">{t('classTitle')}</h3>
        <p className="text-sm text-muted">{t('classHint')}</p>
        <p className="text-sm">
          {t('current', { value: current ? t(`classes.${current}`) : t('classNone') })}
        </p>
        {readOnly ? null : (
          <>
            <SelectField
              label={t('classLabel')}
              value={target}
              onChange={(e) => setTarget(e.target.value as '' | ScreeningClassValue)}
            >
              <option value="">{t('classNone')}</option>
              {SCREENING_CLASSES.filter((c) => c !== current).map((c) => (
                <option key={c} value={c}>
                  {t(`classes.${c}`)}
                </option>
              ))}
            </SelectField>
            {target === 'not_qualified' || target === 'hold' ? (
              <TextField
                label={t('reason')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div>
              <Button
                disabled={
                  target === '' ||
                  classify.isPending ||
                  (target === 'not_qualified' && reason.trim().length < 3)
                }
                onClick={() => classify.mutate()}
              >
                {t('classify')}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
