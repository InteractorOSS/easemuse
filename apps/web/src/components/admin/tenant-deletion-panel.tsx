// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { TenantDeletionView } from '@/server/tenant/deletion';

const POLL_MS = 3000;

/**
 * /admin → one agency → Delete (owners and admins, FR-ADM-08): a suspended agency is deleted in two
 * steps by two different people, each typing the agency's URL name. The result is permanent; the
 * agency's own admins can export their data first (Settings → Data export).
 */
export function TenantDeletionPanel({
  agencyId,
  agencySlug,
  agencyStatus,
  userId,
}: {
  agencyId: string;
  agencySlug: string;
  agencyStatus: string;
  userId: string;
}) {
  const t = useTranslations('admin.agencies.deletion');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const path = `/api/admin/v1/agencies/${agencyId}/deletion`;

  const query = useQuery({
    queryKey: ['admin', 'deletion', agencyId],
    queryFn: ({ signal }) => apiFetch<TenantDeletionView | null>(path, { signal }),
    refetchInterval: (q) =>
      ['approved', 'running'].includes(q.state.data?.data?.status ?? '') ? POLL_MS : false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] });
  const fail = () => setError(t('failed'));
  const request = useMutation({
    mutationFn: () => apiFetch(path, { body: { confirmSlug: typed } }),
    onSuccess: async () => {
      setTyped('');
      toast({ title: t('requested') });
      await refresh();
    },
    onError: fail,
  });
  const approve = useMutation({
    mutationFn: (id: string) => apiFetch(`${path}/${id}/approve`, { body: { confirmSlug: typed } }),
    onSuccess: async () => {
      setTyped('');
      toast({ title: t('approved') });
      await refresh();
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiFetch(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: t('cancelled') });
      await refresh();
    },
    onError: fail,
  });

  const latest = query.data?.data ?? null;
  const open = latest && ['requested', 'approved', 'running'].includes(latest.status);
  const mayAsk = agencyStatus === 'suspended' || agencyStatus === 'closed';
  if (query.isPending) return null;
  if (!open && !mayAsk) return null;

  const confirm = (action: () => void, label: string) => (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        action();
      }}
    >
      <TextField
        label={t('typeName', { slug: agencySlug })}
        value={typed}
        autoComplete="off"
        error={error ?? undefined}
        onChange={(event) => setTyped(event.target.value)}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="danger"
          disabled={
            typed.trim().toLowerCase() !== agencySlug || request.isPending || approve.isPending
          }
        >
          {label}
        </Button>
        {latest && latest.status === 'requested' ? (
          <Button
            variant="secondary"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(latest.id)}
          >
            {t('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );

  return (
    <section aria-labelledby="deletion-heading" className="flex max-w-xl flex-col gap-3">
      <h2 id="deletion-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>
      {latest ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={latest.status === 'failed' ? 'draft' : 'neutral'}>
            {t(`status.${latest.status}`)}
          </Badge>
          <span className="text-muted">
            {t('requestedBy', {
              who: latest.requestedByEmail ?? '?',
              when: format.dateTime(new Date(latest.requestedAt), { dateStyle: 'medium' }),
            })}
          </span>
        </div>
      ) : null}
      {latest?.status === 'failed' ? (
        <p role="alert" className="text-sm text-danger">
          {t('runFailed')}
        </p>
      ) : null}

      {latest?.status === 'requested' && latest.requestedById === userId ? (
        <>
          <p className="text-sm">{t('waitingForSecond')}</p>
          <div>
            <Button
              variant="secondary"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(latest.id)}
            >
              {t('cancel')}
            </Button>
          </div>
        </>
      ) : null}
      {latest?.status === 'requested' && latest.requestedById !== userId
        ? confirm(() => approve.mutate(latest.id), t('approve'))
        : null}
      {latest && (latest.status === 'approved' || latest.status === 'running') ? (
        <p role="status" className="text-sm">
          {t('running', { rows: format.number(latest.rowsRemoved) })}
        </p>
      ) : null}
      {!open && mayAsk ? confirm(() => request.mutate(), t('request')) : null}
    </section>
  );
}
