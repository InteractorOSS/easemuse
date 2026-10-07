// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useId, useState, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { highlight, searchTokens } from '@/lib/highlight';
import type { GlobalSearchResult } from '@/server/search/global';

/** The search box in the header (FR-PLT-06): clients, positions and candidates in one list of links. */
export function GlobalSearch({ agencySlug }: { agencySlug: string }) {
  const t = useTranslations('candidates.globalSearch');
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const deferred = useDeferredValue(text.trim());
  const listId = useId();
  const enabled = deferred.length >= 2;

  // The agency slug works wherever the API takes an agency reference.
  const query = useQuery({
    queryKey: ['global-search', agencySlug, deferred],
    queryFn: ({ signal }) =>
      apiFetch<GlobalSearchResult>(
        `/api/v1/agencies/${agencySlug}/search?q=${encodeURIComponent(deferred)}`,
        { signal },
      ),
    enabled,
  });
  const result = query.data?.data;
  const total = result
    ? result.clients.length + result.positions.length + result.candidates.length
    : 0;
  const tokens = searchTokens(deferred);
  const base = `/a/${agencySlug}`;
  const close = () => setOpen(false);

  return (
    <div
      role="search"
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <input
        type="search"
        aria-label={t('label')}
        aria-controls={listId}
        placeholder={t('placeholder')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="h-9 w-56 rounded-md border border-border bg-background px-3 text-sm lg:w-72"
      />
      <div
        id={listId}
        className="absolute right-0 z-20 mt-1 w-80 rounded-md border border-border bg-background p-2 text-sm shadow-lg"
        hidden={!(open && enabled)}
      >
        {query.isError ? <p role="alert">{t('error')}</p> : null}
        {result ? (
          <>
            <p role="status" className="sr-only">
              {t('count', { count: total })}
            </p>
            {total === 0 ? <p className="p-1 text-muted">{t('none')}</p> : null}
            {result.clients.length ? (
              <Group title={t('clients')}>
                {result.clients.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`${base}/clients?q=${encodeURIComponent(c.name)}`}
                      onClick={close}
                      className="block rounded px-1 py-1 hover:bg-surface"
                    >
                      {highlight(c.name, tokens)}{' '}
                      {c.archived ? (
                        <span className="ml-2 text-xs text-muted">{t('archived')}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
            {result.positions.length ? (
              <Group title={t('positions')}>
                {result.positions.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`${base}/positions/${p.id}`}
                      onClick={close}
                      className="block rounded px-1 py-1 hover:bg-surface"
                    >
                      {highlight(p.title, tokens)}{' '}
                      <span className="ml-2 text-xs text-muted">{p.clientName}</span>
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
            {result.candidates.length ? (
              <Group title={t('candidates')}>
                {result.candidates.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`${base}/candidates/${c.id}`}
                      onClick={close}
                      className="block rounded px-1 py-1 hover:bg-surface"
                    >
                      {highlight(c.fullName, tokens)}
                      {c.currentTitle ? (
                        <span className="ml-2 text-xs text-muted">{c.currentTitle}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </Group>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-2">
      <h2 className="px-1 text-xs font-semibold text-muted uppercase">{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}
