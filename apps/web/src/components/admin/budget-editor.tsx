// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { BudgetStatus } from '@/server/ai/ledger';

/** Shows an agency's AI budget and, for owners and admins, changes it (US-1604). */
export function BudgetEditor({
  agencyId,
  budget,
  canWrite,
}: {
  agencyId: string;
  budget: BudgetStatus;
  canWrite: boolean;
}) {
  const t = useTranslations('admin.agencies.detail.budget');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const usd = (n: number) => format.number(n, { style: 'currency', currency: 'USD' });
  const [value, setValue] = useState(budget.limitUsd === null ? '' : String(budget.limitUsd));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (aiMonthlyBudgetUsd: number | null) =>
      apiFetch(`/api/admin/v1/agencies/${agencyId}/budget`, {
        method: 'PATCH',
        body: { aiMonthlyBudgetUsd },
      }),
    onSuccess: async () => {
      setError(null);
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: () => setError(t('invalid')),
  });

  const submit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed === '') return save.mutate(null);
    const number = Number(trimmed);
    if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return setError(t('invalid'));
    save.mutate(number);
  };

  return (
    <section aria-labelledby="budget-heading" className="flex max-w-xl flex-col gap-3">
      <h2 id="budget-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {budget.limitUsd === null ? t('none') : t('current', { limit: usd(budget.limitUsd) })}
        </span>
        <span className="text-muted">{t('spent', { spent: usd(budget.spentUsd) })}</span>
        <Badge variant={budget.level === 'ok' ? 'neutral' : 'draft'}>
          {t(`level.${budget.level}`)}
        </Badge>
      </div>
      {canWrite ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit(value);
          }}
        >
          <TextField
            label={t('label')}
            inputMode="decimal"
            value={value}
            error={error ?? undefined}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="submit" disabled={save.isPending}>
            {t('save')}
          </Button>
          {budget.limitUsd !== null ? (
            <Button
              variant="secondary"
              disabled={save.isPending}
              onClick={() => {
                setValue('');
                submit('');
              }}
            >
              {t('remove')}
            </Button>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
