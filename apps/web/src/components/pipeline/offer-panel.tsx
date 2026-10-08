// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  COUNTEROFFER_RISKS,
  MILESTONE_STATUSES,
  OFFER_MILESTONES,
  OFFER_OUTCOMES,
  type AgencySettings,
  type Milestones,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import { localDay } from '@/lib/dates';
import type { OfferView } from '@/server/offers/service';

/** The offer record and its outcome, from offer preparation to the start date (T-10-01, brief 12). */
export function OfferPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.offer');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/pipeline/${entryId}/offer`;
  const key = ['offer', agencyId, entryId];
  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<OfferView>(url, { signal }),
  });
  const [edits, setEdits] = useState<
    Partial<Record<(typeof OFFER_MILESTONES)[number], Partial<Milestones['startDate']>>>
  >({});
  const [fields, setFields] = useState<{
    counterofferRisk?: string;
    resignationDate?: string;
    startDate?: string;
  }>({});
  const [outcome, setOutcome] = useState({
    outcome: 'accepted',
    at: localDay(),
    reasonCode: '',
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ['settings', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<AgencySettings>(`/api/v1/agencies/${agencyId}/settings`, { signal }),
    enabled: outcome.outcome === 'declined',
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ['pipeline-entry', agencyId, entryId] });
    await onChanged();
  };
  const save = useMutation({
    mutationFn: () =>
      apiFetch(url, {
        method: 'PUT',
        body: {
          milestones: edits,
          ...(fields.counterofferRisk !== undefined
            ? { counterofferRisk: fields.counterofferRisk || null }
            : {}),
          ...(fields.resignationDate !== undefined
            ? { resignationDate: fields.resignationDate || null }
            : {}),
          ...(fields.startDate !== undefined ? { startDate: fields.startDate || null } : {}),
        },
      }),
    onSuccess: async () => {
      setEdits({});
      setFields({});
      setError(null);
      toast({ title: t('saved') });
      await refresh();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t('error')),
  });
  const record = useMutation({
    mutationFn: () =>
      apiFetch(`${url}/outcome`, {
        body: {
          outcome: outcome.outcome,
          at: outcome.at,
          ...(outcome.reasonCode ? { reasonCode: outcome.reasonCode } : {}),
          ...(outcome.reason.trim() ? { reason: outcome.reason.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      setError(null);
      toast({ title: t('outcomeSaved') });
      await refresh();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t('error')),
  });
  if (!view.data) return null;
  const o = view.data.data;
  const open = !['declined', 'reneged', 'started'].includes(o.state);
  const dirty = Object.keys(edits).length > 0 || Object.keys(fields).length > 0;
  const milestone = (k: (typeof OFFER_MILESTONES)[number]) => ({ ...o.milestones[k], ...edits[k] });
  const patch = (k: (typeof OFFER_MILESTONES)[number], next: Partial<Milestones['startDate']>) =>
    setEdits((e) => ({ ...e, [k]: { ...e[k], ...next } }));

  return (
    <section aria-labelledby="offer-heading" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="offer-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {OFFER_MILESTONES.map((k) => {
          const m = milestone(k);
          const label = t(`milestones.${k}`);
          return (
            <li key={k} className="grid gap-2 sm:grid-cols-[12rem_9rem_9rem_1fr] sm:items-end">
              <span className="text-sm font-medium">{label}</span>
              <SelectField
                label={t('statusFor', { item: label })}
                value={m.status}
                disabled={!open}
                onChange={(e) => patch(k, { status: e.target.value as 'done' })}
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`statuses.${s}`)}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={t('dateFor', { item: label })}
                type="date"
                disabled={!open}
                value={m.date ?? ''}
                onChange={(e) => patch(k, { date: e.target.value || null })}
              />
              <TextField
                label={t('notesFor', { item: label })}
                disabled={!open}
                value={m.notes}
                onChange={(e) => patch(k, { notes: e.target.value })}
              />
            </li>
          );
        })}
      </ul>
      <div className="grid max-w-xl gap-2 sm:grid-cols-3">
        <SelectField
          label={t('risk')}
          disabled={!open}
          value={fields.counterofferRisk ?? o.counterofferRisk ?? ''}
          onChange={(e) => setFields((f) => ({ ...f, counterofferRisk: e.target.value }))}
        >
          <option value="">{t('risks.none')}</option>
          {COUNTEROFFER_RISKS.map((r) => (
            <option key={r} value={r}>
              {t(`risks.${r}`)}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('resignationDate')}
          type="date"
          disabled={!open}
          value={fields.resignationDate ?? o.resignationDate ?? ''}
          onChange={(e) => setFields((f) => ({ ...f, resignationDate: e.target.value }))}
        />
        <TextField
          label={t('startDateField')}
          type="date"
          disabled={!open}
          value={fields.startDate ?? o.startDate ?? ''}
          onChange={(e) => setFields((f) => ({ ...f, startDate: e.target.value }))}
        />
      </div>
      {open ? (
        <div>
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {t('save')}
          </Button>
        </div>
      ) : null}

      <div className="flex max-w-md flex-col gap-2">
        <h3 className="font-medium">{t('outcomeTitle')}</h3>
        <p className="text-sm">
          {o.outcome
            ? t('outcomeNow', { value: t(`outcomes.${o.outcome as 'accepted'}`) })
            : t('noOutcome')}
        </p>
        {o.state === 'started' || o.state === 'declined' || o.state === 'reneged' ? null : (
          <>
            <SelectField
              label={t('outcome')}
              value={outcome.outcome}
              onChange={(e) => setOutcome((s) => ({ ...s, outcome: e.target.value }))}
            >
              {OFFER_OUTCOMES.map((x) => (
                <option key={x} value={x}>
                  {t(`outcomes.${x}`)}
                </option>
              ))}
            </SelectField>
            <TextField
              label={t('outcomeDate')}
              type="date"
              value={outcome.at}
              max={localDay()}
              onChange={(e) => setOutcome((s) => ({ ...s, at: e.target.value }))}
            />
            {outcome.outcome === 'declined' ? (
              <SelectField
                label={t('reasonCode')}
                value={outcome.reasonCode}
                onChange={(e) => setOutcome((s) => ({ ...s, reasonCode: e.target.value }))}
              >
                <option value="" />
                {(settings.data?.data.rejectionReasons ?? []).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectField>
            ) : null}
            {outcome.outcome === 'reneged' ? (
              <TextField
                label={t('reason')}
                value={outcome.reason}
                onChange={(e) => setOutcome((s) => ({ ...s, reason: e.target.value }))}
              />
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div>
              <Button
                variant="secondary"
                disabled={
                  record.isPending ||
                  (outcome.outcome === 'declined' && outcome.reasonCode === '') ||
                  (outcome.outcome === 'reneged' && outcome.reason.trim().length < 3)
                }
                onClick={() => record.mutate()}
              >
                {t('recordOutcome')}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
