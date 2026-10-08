// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { KeyCheck } from '@/server/ai/key-check';
import type { SecretStatus } from '@/server/platform/secrets';

/** Admin → Settings: the Anthropic API key the AI features use (owner enters it; stored encrypted). */
export function SettingsView({ canWrite }: { canWrite: boolean }) {
  const t = useTranslations('admin.settings');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const url = '/api/admin/v1/settings/anthropic';
  const key = ['admin-anthropic-key'];
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<KeyCheck | null>(null);
  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<SecretStatus>(url, { signal }),
  });
  const fail = (e: unknown) => setError(e instanceof ApiClientError ? e.message : t('error'));
  const done = async (title: string) => {
    setError(null);
    setCheck(null);
    toast({ title });
    await queryClient.invalidateQueries({ queryKey: key });
  };
  const save = useMutation({
    mutationFn: () => apiFetch(url, { method: 'PUT', body: { apiKey } }),
    onSuccess: async () => {
      setApiKey('');
      await done(t('saved'));
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(url, { method: 'DELETE' }),
    onSuccess: () => done(t('removed')),
    onError: fail,
  });
  const test = useMutation({
    mutationFn: () => apiFetch<KeyCheck>(`${url}/test`, { method: 'POST' }),
    onSuccess: (r) => {
      setError(null);
      setCheck(r.data);
    },
    onError: fail,
  });
  if (status.isPending) return <p role="status">{states('loading')}</p>;
  if (status.isError) return <p role="alert">{states('error')}</p>;
  const s = status.data.data;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      <section aria-labelledby="anthropic-heading" className="flex flex-col gap-3">
        <h2 id="anthropic-heading" className="text-lg font-semibold">
          {t('anthropic')}
        </h2>
        <p className="text-sm" role="status">
          {s.unreadable
            ? t('unreadable')
            : s.configured
              ? t('inUse', { source: t(`sources.${s.source}`), last4: s.last4 ?? '' })
              : t('none')}
          {s.updatedAt
            ? ` ${t('updatedAt', { date: format.dateTime(new Date(s.updatedAt), { dateStyle: 'medium' }) })}`
            : ''}
        </p>
        {canWrite ? (
          <div className="flex flex-col gap-2">
            <TextField
              label={t('apiKey')}
              hint={t('apiKeyHint')}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={apiKey.trim().length < 10 || save.isPending}
                onClick={() => save.mutate()}
              >
                {t('save')}
              </Button>
              {s.source === 'admin' ? (
                <Button
                  variant="secondary"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {t('remove')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('ownerOnly')}</p>
        )}
        <div>
          <Button
            variant="secondary"
            disabled={test.isPending || !s.configured}
            onClick={() => test.mutate()}
          >
            {t('test')}
          </Button>
        </div>
        {check ? (
          <p
            role={check.ok ? 'status' : 'alert'}
            className={check.ok ? 'text-sm' : 'text-sm text-danger'}
          >
            {t(`check.${check.message}`)}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
