// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';

interface Row {
  clientId: string;
  clientName: string;
  current: 'given' | 'withdrawn' | null;
  since: string | null;
}

/** The candidate's consent per client, with one button each way (FR-CDP-03). */
export function ConsentView({ slug }: { slug: string }) {
  const t = useTranslations('portal.consent');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const { toast } = useToast();
  const client = useQueryClient();
  const url = `/api/portal/v1/${slug}/consents`;
  const key = ['portal-consents', slug];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiFetch<Row[]>(url, { signal }),
  });
  const set = useMutation({
    mutationFn: (v: { clientId: string; action: 'given' | 'withdrawn' }) =>
      apiFetch(url, { body: v }),
    onSuccess: async () => {
      toast({ title: t('saved') });
      await client.invalidateQueries({ queryKey: key });
    },
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted">{t('intro')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {query.data.data.map((r) => (
          <li key={r.clientId} className="flex flex-col gap-2 rounded-md border border-border p-4">
            <p className="font-medium">{t('forClient', { client: r.clientName })}</p>
            <p className="text-sm" role="status">
              {r.current ? t(r.current) : t('none')}
              {r.since ? ` · ${format.dateTime(new Date(r.since), { dateStyle: 'medium' })}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {r.current !== 'given' ? (
                <Button
                  disabled={set.isPending}
                  onClick={() => set.mutate({ clientId: r.clientId, action: 'given' })}
                >
                  {t('give')}
                </Button>
              ) : null}
              {r.current === 'given' ? (
                <Button
                  variant="secondary"
                  disabled={set.isPending}
                  onClick={() => set.mutate({ clientId: r.clientId, action: 'withdrawn' })}
                >
                  {t('withdraw')}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
