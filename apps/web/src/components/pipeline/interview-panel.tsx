// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FEEDBACK_CRITERIA,
  FEEDBACK_FROM,
  FEEDBACK_RATINGS,
  INTERVIEW_STATUSES,
  type FeedbackCriterion,
} from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { InterviewView } from '@/server/interviews/service';

const lines = (value: string) =>
  value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/** Interview rounds and the feedback on each (T-9-01, US-901, US-902). */
export function InterviewPanel({
  agencyId,
  entryId,
  onChanged,
}: {
  agencyId: string;
  entryId: string;
  onChanged: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.interviews');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const url = `/api/v1/agencies/${agencyId}/pipeline/${entryId}/interviews`;
  const key = ['interviews', agencyId, entryId];
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<InterviewView[]>(url, { signal }),
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    await queryClient.invalidateQueries({ queryKey: ['pipeline-entry', agencyId, entryId] });
    await onChanged();
  };
  if (!list.data) return null;
  const rounds = list.data.data;

  return (
    <section aria-labelledby="interviews-heading" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="interviews-heading" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-sm text-muted">{t('hint')}</p>
      </div>
      {rounds.length === 0 ? <p className="text-sm text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col gap-4">
        {rounds.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{r.roundName}</h3>
              <p className="text-sm text-muted">
                {r.scheduledAt
                  ? format.dateTime(new Date(r.scheduledAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : t('unscheduled')}
              </p>
            </div>
            {r.format || r.interviewers.length ? (
              <p className="text-sm text-muted">
                {t('line', { format: r.format ?? '', people: r.interviewers.join(', ') })}
              </p>
            ) : null}
            <RoundStatus url={url} round={r} onSaved={refresh} />
            <Feedback url={url} round={r} onSaved={refresh} />
          </li>
        ))}
      </ul>
      <AddRound url={url} onSaved={refresh} />
    </section>
  );
}

function RoundStatus({
  url,
  round,
  onSaved,
}: {
  url: string;
  round: InterviewView;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.interviews');
  const save = useMutation({
    mutationFn: (status: string) =>
      apiFetch(`${url}/${round.id}`, { method: 'PATCH', body: { status } }),
    onSuccess: onSaved,
  });
  return (
    <div className="max-w-xs">
      <SelectField
        label={t('statusLabel')}
        value={round.status}
        disabled={save.isPending}
        onChange={(e) => save.mutate(e.target.value)}
      >
        {INTERVIEW_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status.${s}`)}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

function Feedback({
  url,
  round,
  onSaved,
}: {
  url: string;
  round: InterviewView;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations('pipeline.interviews');
  const { toast } = useToast();
  const [fromRole, setFromRole] = useState<'hm' | 'candidate'>('hm');
  const [ratings, setRatings] = useState<Partial<Record<FeedbackCriterion, string>>>({});
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`${url}/${round.id}/feedback`, {
        body: {
          fromRole,
          ratings: Object.fromEntries(Object.entries(ratings).filter(([, v]) => v)),
          ...(comments.trim() ? { comments: comments.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      setRatings({});
      setComments('');
      setError(null);
      toast({ title: t('saved') });
      await onSaved();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t('error')),
  });

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-semibold">{t('feedbackTitle')}</h4>
      {round.feedback.length === 0 ? (
        <p className="text-sm text-muted">{t('feedbackNone')}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {round.feedback.map((f) => (
            <li key={f.id}>
              <p className="font-medium">{t(`fromRoles.${f.fromRole as 'hm'}`)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3">
                {FEEDBACK_CRITERIA.filter((k) => f.ratings[k]).map((k) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{t(`criteria.${k}`)}</dt>
                    <dd>{t(`ratings.${f.ratings[k] as 'strong'}`)}</dd>
                  </div>
                ))}
              </dl>
              {f.comments ? <p className="whitespace-pre-wrap">{f.comments}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <fieldset className="flex max-w-xl flex-col gap-2">
        <SelectField
          label={t('from')}
          value={fromRole}
          onChange={(e) => setFromRole(e.target.value as 'hm' | 'candidate')}
        >
          {FEEDBACK_FROM.map((f) => (
            <option key={f} value={f}>
              {t(`fromRoles.${f}`)}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-2 sm:grid-cols-2">
          {FEEDBACK_CRITERIA.map((k) => (
            <SelectField
              key={k}
              label={t('rating', { criterion: t(`criteria.${k}`) })}
              value={ratings[k] ?? ''}
              onChange={(e) => setRatings((r) => ({ ...r, [k]: e.target.value }))}
            >
              <option value="">{t('ratings.none')}</option>
              {FEEDBACK_RATINGS.map((v) => (
                <option key={v} value={v}>
                  {t(`ratings.${v}`)}
                </option>
              ))}
            </SelectField>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`fb-${round.id}`} className="text-sm font-medium">
            {t('comments')}
          </label>
          <textarea
            id={`fb-${round.id}`}
            rows={3}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className="rounded-md border border-border bg-background p-2 text-sm"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <Button
            size="sm"
            disabled={
              save.isPending || (Object.values(ratings).every((v) => !v) && comments.trim() === '')
            }
            onClick={() => save.mutate()}
          >
            {t('saveFeedback')}
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

function AddRound({ url, onSaved }: { url: string; onSaved: () => void | Promise<void> }) {
  const t = useTranslations('pipeline.interviews');
  const [form, setForm] = useState({
    roundName: '',
    scheduledAt: '',
    format: '',
    interviewers: '',
  });
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      apiFetch(url, {
        body: {
          roundName: form.roundName.trim(),
          scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
          format: form.format.trim() || null,
          interviewers: lines(form.interviewers),
        },
      }),
    onSuccess: async () => {
      setForm({ roundName: '', scheduledAt: '', format: '', interviewers: '' });
      setError(null);
      await onSaved();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t('error')),
  });

  return (
    <fieldset className="flex max-w-md flex-col gap-2">
      <legend className="mb-1 font-medium">{t('add')}</legend>
      <TextField
        label={t('roundName')}
        value={form.roundName}
        onChange={(e) => setForm((f) => ({ ...f, roundName: e.target.value }))}
      />
      <TextField
        label={t('scheduledAt')}
        type="datetime-local"
        value={form.scheduledAt}
        onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
      />
      <TextField
        label={t('format')}
        hint={t('formatHint')}
        value={form.format}
        onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="iv-people" className="text-sm font-medium">
          {t('interviewers')}
        </label>
        <textarea
          id="iv-people"
          rows={2}
          value={form.interviewers}
          onChange={(e) => setForm((f) => ({ ...f, interviewers: e.target.value }))}
          className="rounded-md border border-border bg-background p-2 text-sm"
        />
        <p className="text-xs text-muted">{t('interviewersHint')}</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          disabled={add.isPending || form.roundName.trim() === ''}
          onClick={() => add.mutate()}
        >
          {t('addRound')}
        </Button>
      </div>
    </fieldset>
  );
}
