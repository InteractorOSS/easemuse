// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import type { ShareSummary } from '@/server/portal/read';

/** Everything shared with this person, newest first. */
export function ShareList({
  slug,
  prefix,
  audience,
}: {
  slug: string;
  prefix: 'h' | 'c';
  audience: 'hiring_manager' | 'candidate';
}) {
  const t = useTranslations('portal.list');
  const states = useTranslations('common.states');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['portal-shares', slug],
    queryFn: ({ signal }) => apiFetch<ShareSummary[]>(`/api/portal/v1/${slug}/shares`, { signal }),
  });
  if (query.isPending) return <p role="status">{states('loading')}</p>;
  if (query.isError) return <p role="alert">{states('error')}</p>;
  const items = query.data.data;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {audience === 'hiring_manager' ? t('hmTitle') : t('candidateTitle')}
      </h1>
      {items.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {items.map((s) => (
          <li key={s.id}>
            <Link
              href={`/${prefix}/${slug}/s/${s.id}`}
              className="flex flex-col gap-1 rounded-2xl border border-border p-4 hover:bg-surface"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Badge>{t(`kinds.${s.kind}`)}</Badge>
                <span className="font-medium">{s.title}</span>
              </span>
              <span className="text-sm text-muted">
                {s.count === null ? s.subtitle : t('statusCount', { count: s.count })}
              </span>
              <span className="text-xs text-muted">
                {t('published', {
                  date: format.dateTime(new Date(s.publishedAt), { dateStyle: 'medium' }),
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
