// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { MAILBOX_PROVIDERS, type MailboxProvider } from '@easemuse/core';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiClientError, apiFetch } from '@/lib/api-client';
import type { MailboxView as MailboxData } from '@/server/messaging/mailbox';

/** Connect, check and disconnect your own mailbox (T-5-12, US-505). */
export function MailboxView({
  agencyId,
  agencySlug,
  returning,
}: {
  agencyId: string;
  agencySlug: string;
  /** Set when Interactor sent the person back from the provider's sign-in. */
  returning: { provider: MailboxProvider; credentialId: string } | null;
}) {
  const t = useTranslations('settings.mailbox');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = `/api/v1/agencies/${agencyId}/mailbox`;
  const key = ['mailbox', agencyId];
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<MailboxData | null>(base, { signal }),
  });
  const connect = useMutation({
    mutationFn: (provider: MailboxProvider) =>
      apiFetch<{ authorizationUrl: string }>(`${base}/connect`, { body: { provider } }),
    onSuccess: (res) => window.location.assign(res.data.authorizationUrl),
    onError: () => setError(t('error')),
  });
  const record = useMutation({
    mutationFn: (r: { provider: MailboxProvider; credentialId: string }) =>
      apiFetch(base, { body: r }),
    onSuccess: async () => {
      setError(null);
      toast({ title: t('linked') });
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) =>
      setError(e instanceof ApiClientError && e.status === 403 ? t('notYours') : t('error')),
    onSettled: () => window.history.replaceState(null, '', `/a/${agencySlug}/settings/mailbox`),
  });
  const disconnect = useMutation({
    mutationFn: () => apiFetch(base, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: t('disconnected') });
      await queryClient.invalidateQueries({ queryKey: key });
    },
    onError: () => setError(t('error')),
  });

  // Back from the provider: record the connection once.
  const linked = useRef(false);
  useEffect(() => {
    if (returning && !linked.current) {
      linked.current = true;
      record.mutate(returning);
    }
  }, [returning, record]);

  const mailbox = query.data?.data ?? null;
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-muted">{t('intro')}</p>
      {record.isPending ? <p role="status">{t('linking')}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {mailbox ? (
        <section aria-labelledby="mailbox-state" className="flex flex-col gap-2">
          <h2 id="mailbox-state" className="font-medium">
            {t('connected', {
              address: mailbox.address,
              provider: t(`providers.${mailbox.provider}`),
            })}
          </h2>
          {mailbox.status === 'needs_reconnect' ? (
            <p role="alert" className="text-sm">
              {t('needsReconnect')}
            </p>
          ) : (
            <p className="text-sm text-muted">
              {mailbox.lastSyncAt
                ? t('lastSync', {
                    date: format.dateTime(new Date(mailbox.lastSyncAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })
                : t('neverSync')}
            </p>
          )}
          <p className="text-sm text-muted">{t('replies')}</p>
          <div className="flex flex-wrap gap-2">
            {mailbox.status === 'needs_reconnect'
              ? MAILBOX_PROVIDERS.map((p) => (
                  <Button key={p} disabled={connect.isPending} onClick={() => connect.mutate(p)}>
                    {`${t('reconnect')}: ${t(`providers.${p}`)}`}
                  </Button>
                ))
              : null}
            <Button
              variant="secondary"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              {t('disconnect')}
            </Button>
          </div>
        </section>
      ) : query.isSuccess ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={connect.isPending} onClick={() => connect.mutate('google')}>
            {t('connectGoogle')}
          </Button>
          <Button disabled={connect.isPending} onClick={() => connect.mutate('microsoft')}>
            {t('connectMicrosoft')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
