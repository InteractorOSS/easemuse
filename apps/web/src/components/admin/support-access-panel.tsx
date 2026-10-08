// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  SUPPORT_DEFAULT_HOURS,
  SUPPORT_MAX_HOURS,
  supportAccessRequestSchema,
} from '@easemuse/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/api-client';
import type { SupportGrantView } from '@/server/support/access';

const HOURS = [1, 4, SUPPORT_DEFAULT_HOURS, 48, SUPPORT_MAX_HOURS];

/**
 * /admin → one agency → Support access: ask the agency's admins for a time-limited, read-only look at
 * their workspace, see where each request stands, open the workspace while a grant is active, and
 * end it early (FR-ADM-07). Without an active grant there is no way into the agency's content.
 */
export function SupportAccessPanel({
  agencyId,
  agencySlug,
  userId,
}: {
  agencyId: string;
  agencySlug: string;
  userId: string;
}) {
  const t = useTranslations('admin.agencies.support');
  const format = useFormatter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(String(SUPPORT_DEFAULT_HOURS));
  const [error, setError] = useState<string | null>(null);
  const path = `/api/admin/v1/agencies/${agencyId}/support-access`;
  const when = (value: string | Date) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  const grants = useQuery({
    queryKey: ['admin', 'support-access', agencyId],
    queryFn: ({ signal }) => apiFetch<SupportGrantView[]>(path, { signal }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin', 'support-access'] });
  const request = useMutation({
    mutationFn: (body: unknown) => apiFetch(path, { body }),
    onSuccess: async () => {
      setReason('');
      toast({ title: t('requested') });
      await refresh();
    },
    onError: () => setError(t('requestFailed')),
  });
  const end = useMutation({
    mutationFn: (grantId: string) => apiFetch(`${path}/${grantId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast({ title: t('ended') });
      await refresh();
    },
  });

  const list = grants.data?.data ?? [];
  const open = list.some((g) => g.adminId === userId && ['pending', 'active'].includes(g.status));

  function submit() {
    const checked = supportAccessRequestSchema.safeParse({ reason, hours: Number(hours) });
    if (!checked.success) return setError(t('reasonError'));
    setError(null);
    request.mutate(checked.data);
  }

  return (
    <section aria-labelledby="support-heading" className="flex max-w-xl flex-col gap-3">
      <h2 id="support-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-muted">{t('intro')}</p>

      {list.length === 0 ? (
        <p className="text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((grant) => (
            <li
              key={grant.id}
              className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{grant.adminEmail ?? grant.adminId}</span>
                <Badge variant={grant.status === 'active' ? 'draft' : 'neutral'}>
                  {t(`status.${grant.status}`)}
                </Badge>
                {grant.expiresAt && grant.status === 'active' ? (
                  <span className="text-xs text-muted">
                    {t('until', { when: when(grant.expiresAt) })}
                  </span>
                ) : null}
              </div>
              <p>{grant.reason}</p>
              {grant.adminId === userId && ['pending', 'active'].includes(grant.status) ? (
                <div className="flex gap-2">
                  {grant.status === 'active' ? (
                    // A full page load: the workbench is a different part of the app.
                    // eslint-disable-next-line @next/next/no-html-link-for-pages
                    <a
                      href={`/a/${agencySlug}`}
                      className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
                    >
                      {t('open')}
                    </a>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={end.isPending}
                    onClick={() => end.mutate(grant.id)}
                  >
                    {grant.status === 'active' ? t('end') : t('withdraw')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {open ? null : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <TextField
            label={t('reason')}
            hint={t('reasonHint')}
            value={reason}
            maxLength={500}
            error={error ?? undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          <SelectField
            label={t('hours')}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {t('hoursOption', { hours: h })}
              </option>
            ))}
          </SelectField>
          <div>
            <Button type="submit" disabled={request.isPending}>
              {t('request')}
            </Button>
          </div>
        </form>
      )}
      <Link href="/admin/audit" className="text-sm underline">
        {t('auditLink')}
      </Link>
    </section>
  );
}
