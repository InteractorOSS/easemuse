// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { CANDIDATE_UPDATE_FIELDS, type CandidateUpdateField } from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { apiFetch } from '@/lib/api-client';
import type { MyUpdateView } from '@/server/portal/extras';

/** The candidate tells the agency what changed (FR-CDP-04). It goes to the recruiter as a proposal; nothing in the profile changes until they accept. */
export function DetailsView({ slug }: { slug: string }) {
  const t = useTranslations('portal.details');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const url = `/api/portal/v1/${slug}/profile-updates`;
  const key = ['portal-updates', slug];
  const [values, setValues] = useState<Record<CandidateUpdateField, string>>({
    email: '',
    phone: '',
    availability: '',
    compensationExpectation: '',
    workAuthorization: '',
  });
  const [state, setState] = useState<'idle' | 'sent' | 'empty' | 'error'>('idle');
  const mine = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<MyUpdateView[]>(url, { signal }),
  });
  const send = useMutation({
    mutationFn: () => {
      const body = Object.fromEntries(
        CANDIDATE_UPDATE_FIELDS.flatMap((f) => (values[f].trim() ? [[f, values[f].trim()]] : [])),
      );
      if (Object.keys(body).length === 0) return Promise.reject(new Error('empty'));
      return apiFetch(url, { body });
    },
    onSuccess: async () => {
      setState('sent');
      setValues({
        email: '',
        phone: '',
        availability: '',
        compensationExpectation: '',
        workAuthorization: '',
      });
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setState(e instanceof Error && e.message === 'empty' ? 'empty' : 'error'),
  });
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      <form
        noValidate
        aria-label={t('title')}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setState('idle');
          send.mutate();
        }}
      >
        {CANDIDATE_UPDATE_FIELDS.map((f) => (
          <TextField
            key={f}
            label={t(`fields.${f}`)}
            type={f === 'email' ? 'email' : 'text'}
            value={values[f]}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
          />
        ))}
        {state === 'sent' ? <p role="status">{t('sent')}</p> : null}
        {state === 'empty' || state === 'error' ? (
          <p role="alert" className="text-sm text-danger">
            {state === 'empty' ? t('empty') : t('error')}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={send.isPending}>
            {t('send')}
          </Button>
        </div>
      </form>
      <section aria-labelledby="my-updates" className="flex flex-col gap-2">
        <h2 id="my-updates" className="text-lg font-semibold">
          {t('historyTitle')}
        </h2>
        {mine.isPending ? <p role="status">{states('loading')}</p> : null}
        {mine.isSuccess && mine.data.data.length === 0 ? (
          <p className="text-muted">{t('none')}</p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {(mine.data?.data ?? []).map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Badge>{t(`status.${u.status}`)}</Badge>
                <span className="text-muted">
                  {format.dateTime(new Date(u.createdAt), { dateStyle: 'medium' })}
                </span>
              </span>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                {CANDIDATE_UPDATE_FIELDS.filter((f) => u.changes[f] !== undefined).map((f) => (
                  <div key={f} className="contents">
                    <dt className="text-muted">{t(`fields.${f}`)}</dt>
                    <dd>{u.changes[f]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
