// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { WORK_ARRANGEMENTS, positionInputSchema } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { ClientView } from '@/server/clients/service';
import type { PositionView } from '@/server/positions/service';

/** The form holds text only; `toPayload` turns it into what the API takes. */
export interface PositionFormValues {
  clientId: string;
  title: string;
  location: string;
  department: string;
  reportingLine: string;
  workArrangement: string;
  compMin: string;
  compMax: string;
  compCurrency: string;
  requiredExperience: string;
  requiredSkills: string;
  hiringTimeline: string;
  openings: string;
  workAuthorization: string;
}

const number = (v: string) => (v.trim() === '' ? null : Number(v));

export function toPayload(v: PositionFormValues) {
  return {
    clientId: v.clientId,
    title: v.title,
    location: v.location,
    department: v.department,
    reportingLine: v.reportingLine,
    workArrangement: v.workArrangement === '' ? null : v.workArrangement,
    compMin: number(v.compMin),
    compMax: number(v.compMax),
    compCurrency: v.compCurrency || undefined,
    requiredExperience: v.requiredExperience,
    requiredSkills: v.requiredSkills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    hiringTimeline: v.hiringTimeline,
    openings: number(v.openings) ?? undefined,
    workAuthorization: v.workAuthorization,
  };
}

/** Checks the text values against the same schema the API uses and reports each field's problem. */
const resolver: Resolver<PositionFormValues> = async (values) => {
  const result = positionInputSchema.safeParse(toPayload(values));
  if (result.success) return { values, errors: {} };
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? 'title');
    errors[field] ??= { type: 'validation', message: issue.message };
  }
  return { values: {}, errors };
};

const empty = (clientId = ''): PositionFormValues => ({
  clientId,
  title: '',
  location: '',
  department: '',
  reportingLine: '',
  workArrangement: '',
  compMin: '',
  compMax: '',
  compCurrency: 'USD',
  requiredExperience: '',
  requiredSkills: '',
  hiringTimeline: '',
  openings: '1',
  workAuthorization: '',
});

const fromPosition = (p: PositionView): PositionFormValues => ({
  clientId: p.clientId,
  title: p.title,
  location: p.location,
  department: p.department ?? '',
  reportingLine: p.reportingLine ?? '',
  workArrangement: p.workArrangement ?? '',
  compMin: p.compMin === null ? '' : String(p.compMin),
  compMax: p.compMax === null ? '' : String(p.compMax),
  compCurrency: p.compCurrency,
  requiredExperience: p.requiredExperience ?? '',
  requiredSkills: p.requiredSkills.join(', '),
  hiringTimeline: p.hiringTimeline ?? '',
  openings: String(p.openings),
  workAuthorization: p.workAuthorization ?? '',
});

/** Create (no `position`) or edit (US-102): the §3.1 fields. Title, client and location are required. */
export function PositionForm({
  agencyId,
  position,
  onSaved,
  onCancel,
}: {
  agencyId: string;
  position?: PositionView;
  onSaved: (position: PositionView) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations('positions.form');
  const errorsT = useTranslations('positions.errors');
  const [error, setError] = useState<string | null>(null);
  const clients = useQuery({
    queryKey: ['clients', agencyId, 'picker'],
    queryFn: ({ signal }) =>
      apiFetch<ClientView[]>(`/api/v1/agencies/${agencyId}/clients?limit=100`, { signal }),
  });
  const form = useForm<PositionFormValues>({
    resolver,
    defaultValues: position ? fromPosition(position) : empty(),
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (values: PositionFormValues) => {
      const payload = toPayload(values);
      if (!position)
        return apiFetch<PositionView>(`/api/v1/agencies/${agencyId}/positions`, { body: payload });
      const patch: Partial<typeof payload> = { ...payload };
      delete patch.clientId;
      return apiFetch<PositionView>(`/api/v1/agencies/${agencyId}/positions/${position.id}`, {
        method: 'PATCH',
        body: patch,
      });
    },
    onSuccess: (res) => onSaved(res.data),
    onError: (e) => {
      if (e instanceof ApiClientError && e.status === 403) return setError(errorsT('forbidden'));
      if (e instanceof ApiClientError) {
        for (const [field, message] of Object.entries(e.fields)) {
          form.setError(field as keyof PositionFormValues, { message });
        }
      }
      setError(errorsT('generic'));
    },
  });
  const pickable = (clients.data?.data ?? []).filter(
    (c) => !c.archivedAt || c.id === position?.clientId,
  );

  return (
    <form
      noValidate
      aria-label={position ? t('editTitle') : t('createTitle')}
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={form.handleSubmit((v) => {
        setError(null);
        save.mutate(v);
      })}
    >
      <h2 className="text-lg font-semibold">{position ? t('editTitle') : t('createTitle')}</h2>
      <SelectField
        label={t('client')}
        disabled={Boolean(position)}
        error={errors.clientId?.message}
        hint={clients.isSuccess && pickable.length === 0 ? t('noClients') : undefined}
        {...form.register('clientId')}
      >
        <option value="">{t('chooseClient')}</option>
        {pickable.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <TextField label={t('title')} error={errors.title?.message} {...form.register('title')} />
      <TextField
        label={t('location')}
        error={errors.location?.message}
        {...form.register('location')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={t('department')} {...form.register('department')} />
        <TextField label={t('reportingLine')} {...form.register('reportingLine')} />
        <SelectField label={t('workArrangement')} {...form.register('workArrangement')}>
          <option value="">{t('notSet')}</option>
          {WORK_ARRANGEMENTS.map((w) => (
            <option key={w} value={w}>
              {t(`arrangement.${w}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('openings')}
          type="number"
          min={1}
          error={errors.openings?.message}
          {...form.register('openings')}
        />
        <TextField
          label={t('compMin')}
          type="number"
          min={0}
          error={errors.compMin?.message}
          {...form.register('compMin')}
        />
        <TextField
          label={t('compMax')}
          type="number"
          min={0}
          error={errors.compMax?.message}
          {...form.register('compMax')}
        />
        <TextField
          label={t('compCurrency')}
          maxLength={3}
          error={errors.compCurrency?.message}
          {...form.register('compCurrency')}
        />
        <TextField label={t('hiringTimeline')} {...form.register('hiringTimeline')} />
      </div>
      <TextField label={t('requiredExperience')} {...form.register('requiredExperience')} />
      <TextField
        label={t('requiredSkills')}
        hint={t('requiredSkillsHint')}
        {...form.register('requiredSkills')}
      />
      <TextField label={t('workAuthorization')} {...form.register('workAuthorization')} />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>
          {position ? t('submitEdit') : t('submitCreate')}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
