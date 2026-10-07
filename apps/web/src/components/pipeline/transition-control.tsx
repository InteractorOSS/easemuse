// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PIPELINE_TRANSITIONS,
  REASON_CODE_REQUIRED,
  REASON_TEXT_REQUIRED,
  type AgencySettings,
  type PipelineState,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiClientError, apiFetch } from '@/lib/api-client';

/** Moves one candidate to the next stage (T-3-01, US-402): reasons from the agency list, and guard warnings with an override. */
export function TransitionControl({
  agencyId,
  entryId,
  name,
  state,
  onMoved,
}: {
  agencyId: string;
  entryId: string;
  name: string;
  state: PipelineState;
  onMoved: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.move');
  const states = useTranslations('pipeline.states');
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<'' | PipelineState>('');
  const [reasonCode, setReasonCode] = useState('');
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guards, setGuards] = useState<
    { guard: string; mode: 'block' | 'warn'; message: string }[]
  >([]);
  const options = PIPELINE_TRANSITIONS[state];
  const needsCode = target !== '' && REASON_CODE_REQUIRED.includes(target);
  const needsText = target !== '' && REASON_TEXT_REQUIRED.includes(target);

  // The reason list is the agency's own (settings); fetched only when a move needs one.
  const settings = useQuery({
    queryKey: ['settings', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<AgencySettings>(`/api/v1/agencies/${agencyId}/settings`, { signal }),
    enabled: needsCode,
  });
  const move = useMutation({
    mutationFn: (overrides: { guard: string; reason: string }[] = []) =>
      apiFetch(`/api/v1/agencies/${agencyId}/pipeline/${entryId}/transitions`, {
        body: {
          to: target,
          ...(reasonCode ? { reasonCode } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(overrides.length ? { overrideGuards: overrides } : {}),
        },
      }),
    onSuccess: async () => {
      setTarget('');
      setReasonCode('');
      setReason('');
      setOverride('');
      setError(null);
      setGuards([]);
      await queryClient.invalidateQueries({ queryKey: ['review', agencyId] });
      await onMoved();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === 'guard_failed') {
        setError(null);
        setGuards(e.guards);
        return;
      }
      setGuards([]);
      setError(
        e instanceof ApiClientError && e.code === 'invalid_transition'
          ? t('errors.invalid')
          : e instanceof ApiClientError && e.status === 403
            ? t('errors.forbidden')
            : e instanceof ApiClientError && e.status === 422
              ? t('errors.reason')
              : t('errors.generic'),
      );
    },
  });

  if (options.length === 0) return <span className="text-muted">{t('none')}</span>;
  const canOverride = guards.length > 0 && guards.every((g) => g.mode === 'warn');
  return (
    <div className="flex flex-col gap-2">
      <SelectField
        label={t('label', { name })}
        value={target}
        onChange={(e) => {
          setTarget(e.target.value as '' | PipelineState);
          setGuards([]);
          setError(null);
        }}
      >
        <option value="">{t('to')}</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {states(s)}
          </option>
        ))}
      </SelectField>
      {needsCode ? (
        <SelectField
          label={t('reasonCode')}
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value)}
        >
          <option value="">{t('reasonCodeChoose')}</option>
          {(settings.data?.data.rejectionReasons ?? []).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
      ) : null}
      {needsText || needsCode ? (
        <TextField label={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {guards.length > 0 ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-border p-2 text-sm"
        >
          <p className="font-medium">{t('guardTitle')}</p>
          <ul className="list-disc pl-5">
            {guards.map((g) => (
              <li key={g.guard}>{g.message}</li>
            ))}
          </ul>
          {canOverride ? (
            <>
              <TextField
                label={t('overrideReason')}
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={override.trim().length < 3 || move.isPending}
                  onClick={() =>
                    move.mutate(guards.map((g) => ({ guard: g.guard, reason: override.trim() })))
                  }
                >
                  {t('override')}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted">{t('blockedHint')}</p>
          )}
        </div>
      ) : null}
      <div>
        <Button
          size="sm"
          disabled={target === '' || (needsCode && !reasonCode) || move.isPending}
          onClick={() => move.mutate([])}
        >
          {t('go')}
        </Button>
      </div>
    </div>
  );
}
