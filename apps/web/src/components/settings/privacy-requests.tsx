// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { PRIVACY_KINDS } from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { PrivacyRequestView } from '@/server/privacy/service';

interface CandidateHit {
  id: string;
  fullName: string;
  email: string | null;
}

/** Settings → Privacy requests: record, carry out or decline candidate data-rights requests (T-0-06). */
export function PrivacyRequests({ agencyId, isAdmin }: { agencyId: string; isAdmin: boolean }) {
  const t = useTranslations('settings.privacy');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const key = ['privacy-requests', agencyId];
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<PrivacyRequestView[]>(`${base}/privacy-requests`, { signal }),
    // While something is running, keep checking until it finishes.
    refetchInterval: (q) =>
      q.state.data?.data.some((r) => r.status === 'in_progress') ? 3000 : false,
  });
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<CandidateHit | null>(null);
  const [kind, setKind] = useState<(typeof PRIVACY_KINDS)[number]>('export');
  const [note, setNote] = useState('');
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hits = useQuery({
    queryKey: ['privacy-candidate-search', agencyId, search],
    queryFn: ({ signal }) =>
      apiFetch<CandidateHit[]>(`${base}/candidates?q=${encodeURIComponent(search)}&limit=5`, {
        signal,
      }),
    enabled: search.trim().length >= 2 && !chosen,
  });
  const fail = (e: unknown) => setError(e instanceof ApiClientError ? e.message : t('error'));
  const done = async (title: string) => {
    setError(null);
    toast({ title });
    await queryClient.invalidateQueries({ queryKey: key });
  };
  const create = useMutation({
    mutationFn: () =>
      apiFetch(`${base}/privacy-requests`, {
        body: { candidateId: chosen!.id, kind, ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: async () => {
      setChosen(null);
      setSearch('');
      setNote('');
      await done(t('created'));
    },
    onError: fail,
  });
  const start = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${base}/privacy-requests/${id}/start`, { method: 'POST' }),
    onSuccess: () => done(t('started')),
    onError: fail,
  });
  const decline = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${base}/privacy-requests/${id}/reject`, { body: { reason: reason.trim() } }),
    onSuccess: async () => {
      setDeclining(null);
      setReason('');
      await done(t('declined'));
    },
    onError: fail,
  });
  const date = (d: string | Date) => format.dateTime(new Date(d), { dateStyle: 'medium' });

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>

      <fieldset className="flex max-w-md flex-col gap-2">
        <legend className="mb-1 font-medium">{t('new')}</legend>
        {chosen ? (
          <p className="text-sm">
            {t('chosen', { name: chosen.fullName })}{' '}
            <Button variant="ghost" size="sm" onClick={() => setChosen(null)}>
              {t('candidate')}
            </Button>
          </p>
        ) : (
          <>
            <TextField
              label={t('candidateSearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search.trim().length >= 2 && hits.data ? (
              hits.data.data.length === 0 ? (
                <p className="text-sm text-muted">{t('candidateNone')}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {hits.data.data.map((c) => (
                    <li key={c.id}>
                      <Button variant="secondary" size="sm" onClick={() => setChosen(c)}>
                        {t('pick', { name: [c.fullName, c.email].filter(Boolean).join(', ') })}
                      </Button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </>
        )}
        <SelectField
          label={t('kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as 'export')}
        >
          {PRIVACY_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </SelectField>
        <TextField label={t('note')} value={note} onChange={(e) => setNote(e.target.value)} />
        <div>
          <Button disabled={!chosen || create.isPending} onClick={() => create.mutate()}>
            {t('create')}
          </Button>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {list.isPending ? <p role="status">{states('loading')}</p> : null}
      {list.isError ? <p role="alert">{states('error')}</p> : null}
      {list.isSuccess && list.data.data.length === 0 ? (
        <p className="text-muted">{t('empty')}</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {list.data?.data.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {t('line', { kind: t(`kinds.${r.kind}`), name: r.candidateName })}
              </span>
              <span className="flex items-center gap-2">
                {r.overdue ? <Badge variant="draft">{t('overdue')}</Badge> : null}
                <Badge variant="neutral">{t(`status.${r.status}`)}</Badge>
              </span>
            </div>
            <p className="text-sm text-muted">{t('deadline', { date: date(r.deadlineAt) })}</p>
            {r.note ? <p className="text-sm">{r.note}</p> : null}
            {r.decisionNote ? <p className="text-sm">{r.decisionNote}</p> : null}
            {r.fileId ? (
              <a className="text-sm underline" href={`${base}/files/${r.fileId}`}>
                {t('download')}
              </a>
            ) : null}
            {r.status === 'requested' ? (
              isAdmin ? (
                <div className="flex flex-col gap-2">
                  {r.kind === 'delete' ? (
                    <p className="text-sm text-muted">{t('confirmDelete')}</p>
                  ) : null}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={start.isPending} onClick={() => start.mutate(r.id)}>
                      {r.kind === 'delete' ? t('startDelete') : t('startExport')}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setDeclining(r.id)}>
                      {t('reject')}
                    </Button>
                  </div>
                  {declining === r.id ? (
                    <div className="flex max-w-md flex-col gap-2">
                      <TextField
                        label={t('rejectReason')}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                      <div>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={reason.trim().length < 3 || decline.isPending}
                          onClick={() => decline.mutate(r.id)}
                        >
                          {t('rejectConfirm')}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted">{t('adminOnly')}</p>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
