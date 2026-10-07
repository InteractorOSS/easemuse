// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  DEFAULT_MATCH_WEIGHTS,
  GUARD_KEYS,
  GUARD_MODES,
  MATCH_WEIGHT_KEYS,
  UI_LOCALES,
  VISIBILITY_RULES,
  agencySettingsPatchSchema,
  type AgencySettings,
  type GuardKey,
  type GuardMode,
  type MatchWeightKey,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

/** Settings → Defaults: matching weights, outreach timing, guard rules, rejection reasons, visibility, language. */
export function DefaultsForm({ agencyId, canEdit }: { agencyId: string; canEdit: boolean }) {
  const t = useTranslations('settings.defaults');
  const states = useTranslations('common.states');
  const path = `/api/v1/agencies/${agencyId}/settings`;
  const query = useQuery({
    queryKey: ['settings', agencyId],
    queryFn: ({ signal }) => apiFetch<AgencySettings>(path, { signal }),
  });

  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  return (
    <Form
      key={JSON.stringify(query.data.data)}
      agencyId={agencyId}
      initial={query.data.data}
      canEdit={canEdit}
      path={path}
      title={t('title')}
    />
  );
}

function Form({
  agencyId,
  initial,
  canEdit,
  path,
  title,
}: {
  agencyId: string;
  initial: AgencySettings;
  canEdit: boolean;
  path: string;
  title: string;
}) {
  const t = useTranslations('settings.defaults');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reasonsId = useId();
  const [weights, setWeights] = useState<Record<MatchWeightKey, string>>(
    Object.fromEntries(
      MATCH_WEIGHT_KEYS.map((k) => [k, String(initial.defaultMatchingWeights[k])]),
    ) as Record<MatchWeightKey, string>,
  );
  const [intervals, setIntervals] = useState([
    String(initial.outreachIntervalsDays[0]),
    String(initial.outreachIntervalsDays[1]),
  ]);
  const [recent, setRecent] = useState(String(initial.recentlyContactedDays));
  const [guards, setGuards] = useState<Record<GuardKey, GuardMode>>(initial.guardModes);
  const [reasons, setReasons] = useState(initial.rejectionReasons.join('\n'));
  const [visibility, setVisibility] = useState(initial.visibility);
  const [locale, setLocale] = useState<string>(initial.locale ?? 'en');
  const [errors, setErrors] = useState<{ weights?: string; reasons?: string; form?: string }>({});

  const sum = MATCH_WEIGHT_KEYS.reduce((total, k) => total + (Number(weights[k]) || 0), 0);

  const save = useMutation({
    mutationFn: (body: unknown) => apiFetch(path, { method: 'PATCH', body }),
    onSuccess: async () => {
      toast({ title: t('saved') });
      await queryClient.invalidateQueries({ queryKey: ['settings', agencyId] });
    },
    onError: () => setErrors({ form: t('failed') }),
  });

  function submit() {
    const patch = {
      defaultMatchingWeights: Object.fromEntries(
        MATCH_WEIGHT_KEYS.map((k) => [k, Number(weights[k])]),
      ),
      outreachIntervalsDays: [Number(intervals[0]), Number(intervals[1])],
      recentlyContactedDays: Number(recent),
      guardModes: guards,
      rejectionReasons: reasons
        .split('\n')
        .map((r) => r.trim())
        .filter(Boolean),
      visibility,
      locale,
    };
    const checked = agencySettingsPatchSchema.safeParse(patch);
    if (!checked.success) {
      const paths = checked.error.issues.map((i) => String(i.path[0]));
      setErrors({
        weights: paths.includes('defaultMatchingWeights')
          ? t('weights.sumError', { sum })
          : undefined,
        reasons: paths.includes('rejectionReasons') ? t('reasons.error') : undefined,
        form: paths.some((p) => !['defaultMatchingWeights', 'rejectionReasons'].includes(p))
          ? t('failed')
          : undefined,
      });
      return;
    }
    setErrors({});
    save.mutate(checked.data);
  }

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{t('intro')}</p>
        {!canEdit ? <p className="mt-1 text-sm">{t('readOnly')}</p> : null}
      </div>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">{t('weights.title')}</legend>
        <p className="text-sm text-muted">{t('weights.intro')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {MATCH_WEIGHT_KEYS.map((key) => (
            <TextField
              key={key}
              label={t(`weights.keys.${key}`)}
              type="number"
              min={0}
              max={100}
              step={1}
              value={weights[key]}
              placeholder={String(DEFAULT_MATCH_WEIGHTS[key])}
              onChange={(event) => setWeights((w) => ({ ...w, [key]: event.target.value }))}
            />
          ))}
        </div>
        <p
          role={errors.weights ? 'alert' : 'status'}
          className={errors.weights || sum !== 100 ? 'text-sm text-danger' : 'text-sm'}
        >
          {errors.weights ?? t('weights.sum', { sum })}
        </p>
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">{t('outreach.title')}</legend>
        <TextField
          label={t('outreach.second')}
          type="number"
          min={1}
          max={60}
          value={intervals[0]}
          onChange={(e) => setIntervals([e.target.value, intervals[1]!])}
        />
        <TextField
          label={t('outreach.third')}
          type="number"
          min={1}
          max={60}
          value={intervals[1]}
          onChange={(e) => setIntervals([intervals[0]!, e.target.value])}
        />
        <TextField
          label={t('outreach.recent')}
          type="number"
          min={0}
          max={365}
          value={recent}
          onChange={(e) => setRecent(e.target.value)}
        />
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">{t('guards.title')}</legend>
        <p className="text-sm text-muted">{t('guards.intro')}</p>
        {GUARD_KEYS.map((key) => (
          <SelectField
            key={key}
            label={t(`guards.keys.${key}`)}
            value={guards[key]}
            onChange={(e) => setGuards((g) => ({ ...g, [key]: e.target.value as GuardMode }))}
          >
            {GUARD_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`guards.mode.${mode}`)}
              </option>
            ))}
          </SelectField>
        ))}
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-1">
        <legend className="text-lg font-semibold">{t('reasons.title')}</legend>
        <label htmlFor={reasonsId} className="text-sm font-medium">
          {t('reasons.label')}
        </label>
        <textarea
          id={reasonsId}
          rows={8}
          value={reasons}
          aria-invalid={errors.reasons ? true : undefined}
          onChange={(e) => setReasons(e.target.value)}
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
        <p className="text-xs text-muted">{t('reasons.hint')}</p>
        {errors.reasons ? (
          <p role="alert" className="text-xs text-danger">
            {errors.reasons}
          </p>
        ) : null}
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <legend className="text-lg font-semibold">{t('visibility.title')}</legend>
        <SelectField
          label={t('visibility.label')}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as typeof visibility)}
        >
          {VISIBILITY_RULES.map((rule) => (
            <option key={rule} value={rule}>
              {t(`visibility.${rule}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('language.label')}
          hint={t('language.hint')}
          value={locale}
          onChange={(e) => setLocale(e.target.value)}
        >
          {UI_LOCALES.map((code) => (
            <option key={code} value={code}>
              {t(`language.${code}`)}
            </option>
          ))}
        </SelectField>
      </fieldset>

      {errors.form ? (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      ) : null}
      {canEdit ? (
        <div>
          <Button type="submit" disabled={save.isPending}>
            {t('save')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
