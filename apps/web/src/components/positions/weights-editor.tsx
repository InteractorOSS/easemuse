// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MATCH_WEIGHT_KEYS, matchingWeightsSchema, type MatchWeightKey } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

type Texts = Record<MatchWeightKey, string>;

/** Per-position matching weights (US-301, brief 5.1): seven values that must add up to 100. */
export function WeightsEditor({
  agencyId,
  positionId,
  weights,
  canEdit,
  onSaved,
}: {
  agencyId: string;
  positionId: string;
  weights: Record<MatchWeightKey, number>;
  canEdit: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations('positions.weights');
  const labels = useTranslations('settings.defaults.weights.keys');
  const { toast } = useToast();
  const [values, setValues] = useState<Texts>(
    () => Object.fromEntries(MATCH_WEIGHT_KEYS.map((k) => [k, String(weights[k])])) as Texts,
  );
  const [error, setError] = useState<string | null>(null);
  const sum = MATCH_WEIGHT_KEYS.reduce((total, k) => total + (Number(values[k]) || 0), 0);
  const save = useMutation({
    mutationFn: (matchingWeights: Record<MatchWeightKey, number>) =>
      apiFetch(`/api/v1/agencies/${agencyId}/positions/${positionId}`, {
        method: 'PATCH',
        body: { matchingWeights },
      }),
    onSuccess: async () => {
      toast({ title: t('saved') });
      await onSaved();
    },
    onError: () => setError(t('sumError', { sum })),
  });

  return (
    <fieldset disabled={!canEdit} className="flex max-w-2xl flex-col gap-3">
      <legend className="text-lg font-semibold">{t('title')}</legend>
      <p className="text-sm text-muted">{t('intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {MATCH_WEIGHT_KEYS.map((key) => (
          <TextField
            key={key}
            label={labels(key)}
            type="number"
            min={0}
            max={100}
            step={1}
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        ))}
      </div>
      <p
        role={error ? 'alert' : 'status'}
        className={error || sum !== 100 ? 'text-sm text-danger' : 'text-sm'}
      >
        {error ?? t('sum', { sum })}
      </p>
      {canEdit ? (
        <div>
          <Button
            disabled={save.isPending}
            onClick={() => {
              const parsed = matchingWeightsSchema.safeParse(
                Object.fromEntries(MATCH_WEIGHT_KEYS.map((k) => [k, Number(values[k])])),
              );
              if (!parsed.success) return setError(t('sumError', { sum }));
              setError(null);
              save.mutate(parsed.data);
            }}
          >
            {t('save')}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
