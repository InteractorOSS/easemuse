// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  MAX_TEMPLATE_LENGTH,
  OUTREACH_TOKENS,
  OUTREACH_CHANNELS,
  outreachTemplateInputSchema,
  type OutreachChannelValue,
} from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { TemplateView } from '@/server/outreach/templates';

interface Draft {
  id: string | null;
  name: string;
  channel: OutreachChannelValue;
  body: string;
  clientId: string;
  shared: boolean;
}
const BLANK: Draft = {
  id: null,
  name: '',
  channel: 'email',
  body: '',
  clientId: '',
  shared: false,
};

/** Message templates an outreach draft can start from (T-5-11, FR-OUT-06): your own, and the agency's. */
export function TemplatesView({
  agencyId,
  canShare,
}: {
  agencyId: string;
  /** Leads and admins may share a template with the whole agency. */
  canShare: boolean;
}) {
  const t = useTranslations('settings.templates');
  const states = useTranslations('common.states');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}`;
  const key = ['outreach-templates', agencyId];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<TemplateView[]>(`${base}/outreach-templates`, { signal }),
  });
  const clients = useQuery({
    queryKey: ['template-clients', agencyId],
    queryFn: ({ signal }) =>
      apiFetch<{ id: string; name: string }[]>(`${base}/clients?limit=100`, { signal }),
  });
  const done = async (message: string) => {
    setDraft(null);
    setError(null);
    toast({ title: message });
    await queryClient.invalidateQueries({ queryKey: key });
  };
  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        name: d.name,
        channel: d.channel,
        body: d.body,
        clientId: d.clientId || null,
        shared: d.shared,
      };
      return d.id
        ? apiFetch(`${base}/outreach-templates/${d.id}`, { method: 'PATCH', body })
        : apiFetch(`${base}/outreach-templates`, { body });
    },
    onSuccess: () => done(t('saved')),
    onError: () => setError(t('error')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/outreach-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => done(t('deleted')),
  });

  const submit = () => {
    if (!draft) return;
    const checked = outreachTemplateInputSchema.safeParse({
      name: draft.name,
      channel: draft.channel,
      body: draft.body,
      clientId: draft.clientId || null,
      shared: draft.shared,
    });
    if (!checked.success) return setError(t('error'));
    setError(null);
    save.mutate(draft);
  };
  const templates = list.data?.data ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {draft ? null : <Button onClick={() => setDraft(BLANK)}>{t('new')}</Button>}
      </div>
      <p className="text-sm text-muted">
        {t('intro', { first: OUTREACH_TOKENS.firstName, recruiter: OUTREACH_TOKENS.recruiter })}
      </p>

      {draft ? (
        <form
          noValidate
          aria-label={draft.id ? t('edit') : t('new')}
          className="flex flex-col gap-3 rounded-md border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label={t('name')}
            value={draft.name}
            maxLength={80}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t('channel')}
              value={draft.channel}
              onChange={(e) =>
                setDraft({ ...draft, channel: e.target.value as OutreachChannelValue })
              }
            >
              {OUTREACH_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`channels.${c}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('client')}
              value={draft.clientId}
              onChange={(e) => setDraft({ ...draft, clientId: e.target.value })}
            >
              <option value="">{t('anyClient')}</option>
              {clients.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="template-body" className="text-sm font-medium">
              {t('body')}
            </label>
            <textarea
              id="template-body"
              rows={8}
              maxLength={MAX_TEMPLATE_LENGTH}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className="rounded-md border border-border bg-background p-2 text-sm"
            />
            <p className="text-xs text-muted">{t('bodyHint', { max: MAX_TEMPLATE_LENGTH })}</p>
          </div>
          {canShare ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={draft.shared}
                onChange={(e) => setDraft({ ...draft, shared: e.target.checked })}
              />
              <span>
                <span className="font-medium">{t('shared')}</span>
                <span className="block text-muted">{t('sharedHint')}</span>
              </span>
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {t('save')}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : null}

      {list.isPending ? <p role="status">{states('loading')}</p> : null}
      {list.isSuccess && templates.length === 0 ? <p className="text-muted">{t('none')}</p> : null}
      <ul className="flex flex-col gap-3">
        {templates.map((tpl) => (
          <li key={tpl.id} className="flex flex-col gap-2 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{tpl.name}</h2>
              <Badge>{tpl.shared ? t('scopeShared') : t('scopeMine')}</Badge>
              <Badge>{t(`channels.${tpl.channel}`)}</Badge>
              {tpl.clientName ? <Badge>{t('forClient', { client: tpl.clientName })}</Badge> : null}
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted">{tpl.body}</p>
            {tpl.canEdit ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t('editTemplate', { name: tpl.name })}
                  onClick={() =>
                    setDraft({
                      id: tpl.id,
                      name: tpl.name,
                      channel: tpl.channel,
                      body: tpl.body,
                      clientId: tpl.clientId ?? '',
                      shared: tpl.shared,
                    })
                  }
                >
                  {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('deleteTemplate', { name: tpl.name })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(tpl.id)}
                >
                  {t('delete')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
